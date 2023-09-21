async function initialize() {
  const roomCode = Math.floor(Math.random() * (999999999 + 1))
    .toString()
    .padStart(9, "0");
  console.log(roomCode);

  let stream = null;

  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("localScreen").srcObject = stream;
  } catch (err) {
    document.getElementById("localScreen").srcObject = undefined;
    document.getElementById("localScreen").poster =
      "https://www.w3schools.com/images/img_certification_up_generic_html_300.png";
  }
}

initialize();
