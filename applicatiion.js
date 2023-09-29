const galleryElem = document.getElementById("gallery");
const roomCodeElem = document.getElementById("roomCode");

let peer = null;
let localStream = null;
let roomCode = null;

// webrtc provides 2-party bidirectional communication. in order to support
// "conference-style" multiparty communication, the room host keeps track
// of all the peers that have connected to it, and disseminates those
// peers to a new peer whenever it connects, so that it may then connect
// to all of the others.
const connectedParticipants = [];

// the "stream" event gets called twice, so we need to track their ids to prevent
// creating multiple "previews" for a single client.
// @ref: https://github.com/peers/peerjs/issues/609
const connectedMediaStreams = [];

function handleMediaStream(call) {
  call.on("stream", (remoteStream) => {
    if (connectedMediaStreams.includes(remoteStream.id)) return;
    connectedMediaStreams.push(remoteStream.id);

    const currentVideo = galleryElem.children[galleryElem.childElementCount - 1];
    const newNode = currentVideo.cloneNode(false);
    currentVideo.className = "";
    currentVideo.srcObject = remoteStream;
    galleryElem.appendChild(newNode);

    // remove the video if the remote disconnects
    call.on("close", () => currentVideo.remove());
  });
}

function handleVideoCalls(isHost) {
  console.log(`Connecting to room: ${roomCode}`);

  document.getElementById("panel").remove();
  galleryElem.className = "";
  roomCodeElem.className = "";

  peer.on("open", (_) => {
    roomCodeElem.children[0].textContent = roomCode;
    // if im not the host, call the host when im available
    if (!isHost) {
      peer.on("connection", (conn) => {
        // try to connect to all the other participants in the call, as
        // disseminated by the host
        conn.on("data", (data) => {
          data.forEach((participant) => {
            const call = peer.call(participant, localStream);
            handleMediaStream(call);
          });
          // nothing will get sent over this again, so we can throw it out
          // TBD/TODO: keep open for host swapping?
          conn.close();
        });
      });

      const call = peer.call(roomCode, localStream);
      handleMediaStream(call);
    }
  });

  peer.on("call", (call) => {
    call.answer(localStream);
    handleMediaStream(call);

    if (isHost) {
      // send all the other room participants the new peer.
      // it is the responsibility of a new participant to connect to all
      // other participants, rather than all other participants to connect
      // to the new one.
      //
      // the first participant has no way of knowing it is the first, and
      // thus waits for a message before terminating the data connection,
      // so this must send it an empty list rather than nothing at all.
      const conn = peer.connect(call.peer);
      conn.on("open", () => {
        conn.send(connectedParticipants);
        connectedParticipants.push(call.peer);
      });
    }
  });
}

async function setupCreateDiscussion() {
  document.getElementById("create").addEventListener("click", (_) => {
    roomCode = Math.floor(Math.random() * (999999999 + 1))
      .toString()
      .padStart(9, "0");

    peer = new Peer(roomCode, { secure: true });
    handleVideoCalls(true);
  });
}

async function setupJoinDiscussion() {
  document.getElementById("join").addEventListener("click", (_) => {
    roomCode = document.getElementById("remoteRoomCode").value.trim();

    peer = new Peer({ secure: true });
    handleVideoCalls(false);
  });
}

async function initialize() {
  // ensure cleanup
  window.addEventListener("beforeunload", function (_) {
    console.log("Handling connection cleanup...");
    if (peer) peer.destroy();
  });

  // setup button handlers (and subsequent connection logic)
  setupCreateDiscussion();
  setupJoinDiscussion();

  const localScreen = document.getElementById("localScreen");
  try {
    // setup the local camera
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    localScreen.srcObject = localStream;
    localScreen.muted = true;

    // setup mic and camera controls
    function setupControl(element, track, icon) {
      element.className = "control icon";
      element.addEventListener("click", (_) => {
        const enabled = track.enabled;
        track.enabled = !enabled;
        element.src = `vendor/icons/${icon}${enabled ? "-slash-" : "-"}solid.svg`;
      });
    }

    // setup mic mute button
    setupControl(
      document.getElementById("muteAudio"),
      localStream.getAudioTracks()[0],
      "microphone"
    );
    // setup camera mute button
    setupControl(
      document.getElementById("muteVideo"),
      localStream.getVideoTracks()[0],
      "video"
    );

    // enable create/join buttons
    document.getElementById("join").removeAttribute("disabled");
    document.getElementById("create").removeAttribute("disabled");
  } catch (err) {
    localScreen.srcObject = undefined;
    localScreen.poster = "vendor/icons/video-slash-solid.svg";
  }
}

initialize();
