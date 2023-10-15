# Parley 🏴‍☠️

No-frills peer-to-peer web conferencing.

## Features

- Create a new discussion room.
- Join an existing room.
- See and hear others.
- See yourself.
- Mute your mic and camera.
  - Audio mute indicators on yourself and participants.
- Have a screen name.

## Not features

- Breakout rooms.
- Session recording.

## To Do

1. Chat.
2. Connect via URL.

   - If you go to a URL with a peer id that already exists, you connect to their session.
   - If you go to a URL with a peer id that doesn't exist, you become the host (with that peer id) and start a session.

3. Legitimate error handling.

   - Kick everyone out if the host is destroyed / closes.
     - or ... transfer host? i think this word be pretty trivial - just pick a client, send a packet saying "set `isHost` and the list of original host's `connectedParticipants`" -- they may already have the latter information via either of the cached mappings.
   - What to do if temporary disconnect?
     - Figure out a way to `.reconnect()`?
     - Destroy the peer and revisit main page (kick them out)?

4. Mobile site (no video, audio + chat only).
5. Performance

   - All `call` or `send` functions should be async-concurrent, so that network IO happens concurrently.
   - Restrict local video to 640p using [sdp transform or media constraints](https://stackoverflow.com/questions/71838689/how-to-use-sdptransform-in-peerjs-for-high-quality-audio-bitrate)
   - Restrict outgoing video to 144p.
   - Frame rate?
   - Spoke-style communication? (instead of each connecting to every other, they all connect to the host which sends AV/data to every other)
     - Not immediately obvious if this is a better design -- it reduces the total number of conns, but at least doubles latency for each one

## License

TBD.
