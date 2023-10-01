# Parley 🏴‍☠️

No-frills encrypted peer-to-peer web conferencing.

## Features

- Create a new discussion room.
- Join an existing room.
- See and hear others.
- See yourself.
- Mute your mic and camera.
  - Audio mute indicators on yourself and participants.

## To Do

- Screen name.
- Chat.
- Legitimate error handling.
  - Don't allow connecting to invalid rooms (`.on("error") with invalid-peer type`)
  - Kick everyone out if the host disconnects.
    - or ... transfer host? i think this word be pretty trivial - just pick a client, send a packet saying "set `isHost` and the list of original host's `connectedParticipants`" -- they may already have the latter information via either of the cached mappings.
- Mobile site (no video, chat only).
- Performance
  - Restrict local video to 640p using [sdp transform or media constraints](https://stackoverflow.com/questions/71838689/how-to-use-sdptransform-in-peerjs-for-high-quality-audio-bitrate)
  - Restrict outgoing video to 128p.

## License

TBD.
