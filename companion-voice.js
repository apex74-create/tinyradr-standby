/* Shared hold-to-talk and receive lifecycle for both paired-device faces. */
(function () {
  window.CompVoice = function (button, report) {
    var held = false,
      pending = false,
      recorder = null,
      timer = null;
    var audio = new Audio(),
      waiting = null,
      context = null;
    audio.preload = "auto";
    function unlock() {
      try {
        var Context = window.AudioContext || window.webkitAudioContext;
        if (Context) {
          context = context || new Context();
          if (context.state === "suspended") context.resume().catch(function () {});
        }
      } catch (e) {}
      if (waiting) play(waiting);
    }
    function play(uri) {
      waiting = uri;
      audio.src = uri;
      try {
        var result = audio.play();
        if (result && result.then)
          result.then(
            function () {
              waiting = null;
            },
            function () {
              report("TAP TO HEAR VOICE");
            },
          );
      } catch (e) {
        report("TAP TO HEAR VOICE");
      }
    }
    audio.onerror = function () {
      report("VOICE FORMAT NOT SUPPORTED ON THIS DEVICE");
    };
    document.addEventListener("pointerdown", unlock, true);
    function reset() {
      clearTimeout(timer);
      button.classList.remove("on");
      button.textContent = "HOLD TO TALK";
    }
    function stop() {
      held = false;
      reset();
      if (recorder && recorder.state === "recording") recorder.stop();
    }
    function start(e) {
      e.preventDefault();
      if (held || pending || recorder) return;
      if (!window.Comp.paired()) {
        report("PAIR A DEVICE FIRST");
        return;
      }
      if (
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia ||
        !window.MediaRecorder
      ) {
        report("MIC CAPTURE UNAVAILABLE ON THIS DEVICE");
        return;
      }
      held = true;
      pending = true;
      button.textContent = "OPENING MIC…";
      if (button.setPointerCapture) button.setPointerCapture(e.pointerId);
      navigator.mediaDevices.getUserMedia({ audio: true }).then(
        function (stream) {
          pending = false;
          if (!held) {
            stream.getTracks().forEach(function (t) {
              t.stop();
            });
            return;
          }
          var chunks = [],
            current;
          try {
            var types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
            var type = types.filter(function (t) {
              return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t);
            })[0];
            current = type
              ? new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 24000 })
              : new MediaRecorder(stream);
            recorder = current;
            current.ondataavailable = function (event) {
              if (event.data.size) chunks.push(event.data);
            };
            current.onstop = function () {
              recorder = null;
              held = false;
              reset();
              stream.getTracks().forEach(function (t) {
                t.stop();
              });
              var blob = new Blob(chunks, { type: current.mimeType });
              if (!blob.size) {
                report("NO VOICE RECORDED · TRY AGAIN");
                return;
              }
              var reader = new FileReader();
              reader.onload = function () {
                window.Comp.send("voice", { body: reader.result })
                  .then(function (ok) {
                    report(ok ? "VOICE SENT" : "VOICE NOT SENT · OFFLINE");
                  })
                  .catch(function () {
                    report("VOICE NOT SENT · TRY AGAIN");
                  });
              };
              reader.readAsDataURL(blob);
            };
            current.onerror = function () {
              report("MIC RECORDING FAILED");
              stop();
            };
            current.start(250);
            button.classList.add("on");
            button.textContent = "TALKING · RELEASE TO SEND";
            timer = setTimeout(stop, 8000);
          } catch (err) {
            recorder = null;
            held = false;
            reset();
            stream.getTracks().forEach(function (t) {
              t.stop();
            });
            report("MIC FAILED: " + err.name);
          }
        },
        function (err) {
          pending = false;
          held = false;
          reset();
          report("MIC BLOCKED: " + err.name);
        },
      );
    }
    button.addEventListener("pointerdown", start);
    document.addEventListener("pointerup", stop);
    document.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
    });
    return {
      receive: function (o) {
        report(o.call + " · VOICE");
        play(o.body);
      },
    };
  };
})();
