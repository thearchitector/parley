const galleryElem = document.getElementById("gallery");
const roomCodeElem = document.getElementById("roomCode");
const galleryTemplate = galleryElem.children[1];
const nameElement = document.getElementById("name");

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

// communication is trivial once you've established both sides of the party can talk.
// when a participant is first connecting, however, theres no guarantee that either side
// will be ready enough to receive the data the other party has sent them. this is
// problematic for synchronizing initial state, as both sides need to send info like
// "mute status" and "display name". to avoid figuring out all the proper execution
// flows, and to keep the mental model simpler, this instead tracks all the
// mediastream-related data requests a client has received BEFORE that client has
// concretely established a 2-way AV stream with the other party. each client is then
// responsible for running the initialization callbacks related to the other party,
// rather than both parties indicating they should sync states with each other once
// both parties are ready.
//
// in order words, when this client establishes a data channel, the other party will
// send its current state. those updates will be queued until this client has finished
// setting up the AV stuff, at which point it will then make those updates. if this
// client is already done setting stuff up, then nothing needs to be queued and those
// updates can happen as they would normally (immediately).
//
// this WILL cause a race condition if the other party changes state between sending
// its state and the queued updates being run, but i asset it is the lesser of the two
// synchronization evils.
const stateInitializationQueues = {};

function runOrQueueUpdate(peerId, updateFn) {
  /**
   * If the provided peer already has an AV connection, run the update immediately.
   * Otherwise, add the callback to peer's queue so that it may be run when the stream
   * is established.
   */
  if (peerId in connectedMediaStreams) updateFn();
  else stateInitializationQueues[peerId].push(updateFn);
}

function handleDataPackets(packet) {
  /** Defines the expected behavior for every packet of data received by the client. */
  const payload = packet.payload;
  const peerId = packet.peerId;

  switch (packet["type"]) {
    case "initialize":
      // try to connect to all the other participants in the call, as
      // disseminated by the host
      payload.forEach(connectToRemote);
      break;
    case "syncMute":
      // toggle the mute icon
      runOrQueueUpdate(peerId, () => {
        connectedMediaStreams[
          peerId
        ].children[1].children[0].src = `vendor/icons/microphone${
          payload ? "-" : "-slash-"
        }solid.svg`;
      });
      break;
    case "changeName":
      // update the peer's display name
      runOrQueueUpdate(peerId, () => {
        connectedMediaStreams[peerId].children[1].children[1].textContent = payload;
      });
      break;
    default:
      console.warn(
        `Received unexpected data packet payload of type ${packet["type"]} from peer ${peerId}`
      );
  }
}

function establishDataStream(datachannel) {
  /**
   * Setups up the callbacks necessary to initialize, process, and close a
   * datachannel. Packets of data are given to the handler to understand.
   */

  // remove the channel mapping if the remote disconnects
  datachannel.on("close", () => {
    // these should always be true, but protects against the race condition where
    // the remote disconnects before the channel is actually opened
    if (datachannel.peer in connectedDataChannels)
      delete connectedDataChannels[datachannel.peer];
    if (datachannel.peer in stateInitializationQueues)
      delete stateInitializationQueues[datachannel.peer];
  });

  // as soon as the connection is available
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

    // send current mute status
    datachannel.send({
      peerId: peer.id,
      type: "syncMute",
      payload: localStream.getAudioTracks()[0].enabled,
    });

    // send display name
    datachannel.send({
      peerId: peer.id,
      type: "changeName",
      payload: nameElement.value,
    });

    connectedDataChannels[datachannel.peer] = datachannel;
    stateInitializationQueues[datachannel.peer] = [];
  });

  // handles processing incoming data payloads according to their type
  datachannel.on("data", handleDataPackets);
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
    connectedMediaStreams[peerId] = newPreview;
    call.on("close", () => {
      newPreview.remove();
      delete connectedMediaStreams[peerId];
    });

    // run any pending initializations
    if (peerId in stateInitializationQueues)
      stateInitializationQueues[peerId].forEach((fn) => fn());
    delete stateInitializationQueues[peerId];

    // update the DOM
    newPreview.children[0].srcObject = remoteStream;
    newPreview.className = "preview";
    galleryElem.prepend(newPreview);
  });
}

function connectToRemote(peerId) {
  // connect (establish data connection)
  const datachannel = peer.connect(peerId, dataChannelConfig);
  establishDataStream(datachannel);

  // call (establish AV connection)
  const call = peer.call(peerId, localStream);
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
  peer.on("connection", establishDataStream);

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
  /** Runs prerequisite initialization, including graceful disconnects. */
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
            peerId: peer.id,
            type: "syncMute",
            payload: { muted: isMuted },
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

    // assign a random name
    nameElement.parentElement.className = "name-container";
    nameElement.value = nameElement.parentNode.dataset.value = randomName();
    // setup handlers to propagate name changes
    nameElement.addEventListener(
      "input",
      (_) => (nameElement.parentNode.dataset.value = nameElement.value)
    );
    nameElement.addEventListener("change", (_) => {
      if (nameElement.value.length === 0)
        nameElement.value = nameElement.parentNode.dataset.value = randomName();

      nameElement.blur();

      for (const participant in connectedMediaStreams) {
        const datachannel = connectedDataChannels[participant];
        datachannel.send({
          type: "changeName",
          payload: { peerId: peer.id, displayName: nameElement.value },
        });
      }
    });

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
