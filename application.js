const galleryElem = document.getElementById("gallery");
const roomCodeElem = document.getElementById("roomCode");
const galleryTemplate = galleryElem.children[1];

const peerConfig = { secure: true };
const dataChannelConfig = { serialization: "json" };

let peer = null;
let localStream = null;
let roomCode = null;
let isHost = false;

/*
 * webrtc provides 2-party bidirectional communication. in order to support
 * "conference-style" multiparty communication, every client keeps track
 * of all the peers that have connected to it, so it may send status updates
 * or respond to data payloads.
 */
// a mapping of between a remote peer's id and the communication pipe to it.
// since we know a pipe must exist (vs a media stream, which may not because of
// no AV hardware), this also serves as the authoritative list of connected remotes
const connectedDataChannels = {};
// a mapping of between a remote peer id and its mute status icon element
const connectedMediaStreams = {};

function handleEventPackets(datachannel) {
  // remove the channel mapping if the remote disconnects
  datachannel.on("close", () => {
    // this should always be true, but protects against the race condition where
    // the remote disconnects before the channel is actually opened
    if (datachannel.peer in connectedDataChannels)
      delete connectedDataChannels[datachannel.peer];
  });

  // const hasInitialized = new Promise((resolve) => {
  // as soon as the connection is available, send whatever data is required to
  // sync the local and remote states
  datachannel.on("open", () => {
    if (isHost) {
      // send all the other room participants the new peer.
      // it is the responsibility of a new participant to connect to all
      // other participants, rather than all other participants to connect
      // to the new one.
      //
      // the first participant has no way of knowing it is the first, and
      // thus waits for a message before terminating the data connection,
      // so this must send it an empty list rather than nothing at all.
      datachannel.send({
        type: "initialize",
        payload: Object.keys(connectedDataChannels),
      });
    }

    connectedDataChannels[datachannel.peer] = datachannel;
    // resolve();
  });
  // });

  // handles processing incoming data payloads according to their type
  datachannel.on("data", (data) => {
    const payload = data.payload;

    switch (data["type"]) {
      case "initialize":
        // try to connect to all the other participants in the call, as
        // disseminated by the host
        payload.forEach(connectToRemote);
        break;
      case "syncMute":
        // toggle the mute icon
        connectedMediaStreams[payload.peerId].src = `vendor/icons/microphone${
          payload.muted ? "-slash-" : "-"
        }solid.svg`;
        break;
      default:
        console.warn(`Received unexpected data packet payload of type ${data.type}`);
    }
  });

  // this function returns a promise to ensure that
  // return hasInitialized;
}

function handleMediaStream(call) {
  /**
   * Handles received media calls by adding or removing their remote media streams
   * to and from the gallery upon connection or disconnection.
   */
  call.on("stream", (remoteStream) => {
    // the "stream" event gets called twice, so skip handling if the remote is in our
    // mapping already, as to prevent creating multiple "previews" for a single client.
    // @ref: https://github.com/peers/peerjs/issues/609
    const peerId = call.peer;
    if (peerId in connectedMediaStreams) return;

    const newPreview = galleryTemplate.cloneNode(true);

    // remove the video if the remote disconnects
    connectedMediaStreams[peerId] = newPreview.children[1].children[0];
    call.on("close", () => {
      newPreview.remove();
      delete connectedMediaStreams[peerId];
    });

    // update the DOM (set initial mute status, unhide the preview element and add
    // the next template)
    connectedMediaStreams[peerId].src = `vendor/icons/microphone${
      call.metadata.muted ? "-slash-" : "-"
    }solid.svg`;
    newPreview.children[0].srcObject = remoteStream;
    newPreview.className = "preview";
    galleryElem.prepend(newPreview);
  });
}

function connectToRemote(peerId) {
  // connect (establish data connection)
  const datachannel = peer.connect(peerId, dataChannelConfig);
  handleEventPackets(datachannel);

  // call (establish AV connection), providing the current mute state.
  //
  // this CAN cause a race condition if someone (un)mutes between
  // this call and when the setup on the remote side is complete enough
  // to receive the status change. it is the lesser of the two
  // synchronization evils, though (the alternative being sending the
  // status only after both sides are certain the other has finished setting
  // everything up -- not trivial)
  const call = peer.call(peerId, localStream, {
    metadata: { muted: !localStream.getAudioTracks()[0].enabled },
  });
  handleMediaStream(call);
}

function parley() {
  /**
   * Initializes a parley by binding listeners to the initialization, data packet,
   * and AV call events.
   */
  console.debug(`Connecting to room: ${roomCode}`);

  document.getElementById("panel").remove();
  roomCodeElem.className = "";

  // on assigned identity
  peer.on("open", (id) => {
    console.debug(`Local identity: ${id}`);
    roomCodeElem.children[0].textContent = roomCode;

    // when im available, and im not the host, connect to it
    if (!isHost) connectToRemote(roomCode);
  });

  // on established data channel
  peer.on("connection", handleEventPackets);

  // on received media call
  peer.on("call", (call) => {
    handleMediaStream(call);
    call.answer(localStream);
  });
}

function setupCreateDiscussion(createElement) {
  /** Creates a new discussion. */
  createElement.addEventListener("click", (_) => {
    isHost = true;
    roomCode = Math.floor(Math.random() * (999999999 + 1))
      .toString()
      .padStart(9, "0");

    peer = new Peer(roomCode, peerConfig);
    parley();
  });
}

function setupJoinDiscussion(joinElement) {
  /** Joins an existing discussion. */
  joinElement.addEventListener("click", (_) => {
    roomCode = document.getElementById("remoteRoomCode").value.trim();

    peer = new Peer(peerConfig);
    parley();
  });
}

(async () => {
  /**
   * Runs prerequisite initialization, including graceful disconnects.
   */
  const localScreen = document.getElementById("localScreen");
  try {
    // setup the local camera
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localScreen.srcObject = localStream;
    localScreen.muted = true; // prevent feedback

    // setup mic and camera controls
    const controlsElem = document.getElementById("controls");
    function setupControl(element, track, icon, sideEffect) {
      element.className = "icon";
      element.addEventListener("click", (_) => {
        const willDisable = track.enabled;
        track.enabled = !willDisable;
        element.src = `vendor/icons/${icon}${willDisable ? "-slash-" : "-"}solid.svg`;

        // if the video is disabled, invert both icon colors so they're easier to see
        if (icon === "video")
          controlsElem.className = `icons controls ${willDisable ? "inverted" : ""}`;

        // run side effect
        if (sideEffect !== undefined) sideEffect(willDisable);
      });

      return element;
    }

    // setup mic mute button
    setupControl(
      document.getElementById("muteAudio"),
      localStream.getAudioTracks()[0],
      "microphone",
      (isMuted) => {
        // mediastreams come with a "mute" and "unmute" event. unfortunately, those
        // events are not propagated across the network. instead, we have to send
        // an "event packet" updating all clients whenever our local state changes.
        for (const participant in connectedMediaStreams) {
          // loop through media streams keys instead of channels since only clients
          // connected via media streams can (un)mute
          const datachannel = connectedDataChannels[participant];
          datachannel.send({
            type: "syncMute",
            payload: { peerId: peer.id, muted: isMuted },
          });
        }
      }
    ).click();
    // setup camera mute button
    setupControl(
      document.getElementById("muteVideo"),
      localStream.getVideoTracks()[0],
      "video"
    );

    // ensure graceful closure and cleanup of the local peer
    // this is super important
    window.addEventListener("beforeunload", function (_) {
      console.debug("Handling connection cleanup...");
      if (peer) peer.destroy();
    });

    // setup button handlers (and subsequent connection logic)
    const createElement = document.getElementById("create");
    const joinElement = document.getElementById("join");
    setupCreateDiscussion(createElement);
    setupJoinDiscussion(joinElement);

    // enable create/join buttons
    createElement.removeAttribute("disabled");
    joinElement.removeAttribute("disabled");
  } catch (err) {
    localScreen.srcObject = undefined;
    localScreen.poster = "vendor/icons/video-slash-solid.svg";
    console.error("Camera and microphone access is required.");
  }
})();
