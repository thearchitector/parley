# Parley 🏴‍☠️

No-frills encrypted peer-to-peer web conferencing.

## Features

- Create a new discussion room.
- Join an existing room.
- See yourself.
- See and hear others.

## To Do

- Mute button.
- Screen name.
- Chat.
- Legitimate error handling
  - Don't allow connecting to invalid rooms (`.on("error") with invalid-peer type`)
  - Kick everyone out if the host disconnects.
- Mobile site (no video, chat only).
- Performance
  - Restrict local video to 640p using [sdp transform or media constraints](https://stackoverflow.com/questions/71838689/how-to-use-sdptransform-in-peerjs-for-high-quality-audio-bitrate)
  - Restrict outgoing video to 128p.

## License

TBD.
