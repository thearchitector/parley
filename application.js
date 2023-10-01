const galleryElem = document.getElementById("gallery");
const roomCodeElem = document.getElementById("roomCode");

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
// hosts disseminate this list of peers to a new peer whenever it connects, so
// that it may then connect to all of the others.
const connectedParticipants = [];
// a mapping of between a remote peer id and its mute status icon element
const connectedMediaStreams = {};
// a mapping of between a remote peer's id and the communication pipe to it
const connectedDataChannels = {};

function handleEventPackets(datachannel) {
  connectedDataChannels[datachannel.peer] = datachannel;

  // remove the channel mapping if the remote disconnects
  datachannel.on("close", () => {
    delete connectedDataChannels[datachannel.peer];
  });

  // as soon as the connection is available, send whatever data is required to
  // sync the local and remote states
  datachannel.on("open", () => {
    // current mute status
    datachannel.send({
      type: "syncMute",
      payload: { peerId: peer.id, muted: !localStream.getAudioTracks()[0].enabled },
    });

    if (isHost) {
      // send all the other room participants the new peer.
      // it is the responsibility of a new participant to connect to all
      // other participants, rather than all other participants to connect
      // to the new one.
      //
      // the first participant has no way of knowing it is the first, and
      // thus waits for a message before terminating the data connection,
      // so this must send it an empty list rather than nothing at all.
      datachannel.send({ type: "initialize", payload: connectedParticipants });
      connectedParticipants.push(datachannel.peer);
    }
  });

  // handles processing incoming data payloads according to their type
  datachannel.on("data", (data) => {
    const payload = data.payload;

    switch (data["type"]) {
      case "initialize":
        // try to connect to all the other participants in the call, as
        // disseminated by the host
        payload.forEach((participant) => {
          const call = peer.call(participant, localStream);
          handleMediaStream(call);
        });
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
    if (call.peer in connectedMediaStreams) return;

    const currentVideo = galleryElem.children[galleryElem.childElementCount - 1];
    const newNode = currentVideo.cloneNode(true);

    // remove the video if the remote disconnects
    connectedMediaStreams[call.peer] = currentVideo.children[1].children[0];
    call.on("close", () => {
      currentVideo.remove();
      delete connectedMediaStreams[call.peer];
      if (galleryElem.children.length === 2) galleryElem.children[0].className = "";
    });

    // update the DOM (unhide the preview element and add the next template)
    if (galleryElem.children.length === 2) galleryElem.children[0].className = "hidden";
    currentVideo.children[0].srcObject = remoteStream;
    currentVideo.className = "preview";
    galleryElem.appendChild(newNode);
  });
}

function parley() {
  /**
   * Initializes a parley by binding listeners to the initialization, data packet,
   * and AV call events.
   */
  console.debug(`Connecting to room: ${roomCode}`);

  document.getElementById("panel").remove();
  galleryElem.className = "";
  roomCodeElem.className = "";

  // on assigned identity
  peer.on("open", (_) => {
    roomCodeElem.children[0].textContent = roomCode;
    // when im available, and im not the host, connect to it
    if (!isHost) {
      // call (establish AV connection)
      const call = peer.call(roomCode, localStream);
      handleMediaStream(call);

      // connect (establish data connection)
      const datachannel = peer.connect(roomCode, dataChannelConfig);
      handleEventPackets(datachannel);
    }
  });

  // on established data channel
  peer.on("connection", handleEventPackets);

  // on received media call
  peer.on("call", (call) => {
    call.answer(localStream);
    handleMediaStream(call);
  });
}

async function setupCreateDiscussion(createElement) {
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

async function setupJoinDiscussion(joinElement) {
  /** Joins an existing discussion. */
  joinElement.addEventListener("click", (_) => {
    roomCode = document.getElementById("remoteRoomCode").value.trim();

    peer = new Peer(peerConfig);
    parley();
  });
}

async function initialize() {
  /** Runs prerequisite initialization, including graceful disconnects */
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
    function setupControl(element, track, icon, sideEffect) {
      element.className = "control icon";
      element.addEventListener("click", (_) => {
        const willDisable = track.enabled;
        track.enabled = !willDisable;
        element.src = `vendor/icons/${icon}${willDisable ? "-slash-" : "-"}solid.svg`;

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
        // an "event packet" updating all clients whenever our local state changes
        for (const participant in connectedDataChannels) {
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
  }
}

initialize();
