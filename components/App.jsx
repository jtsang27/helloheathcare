import { useEffect, useRef, useState } from "react";
import logo from "/assets/openai-logomark.svg";
import EventLog from "./EventLog";
import SessionControls from "./SessionControls";
import TranscriptManager from "/components/TranscriptManager.jsx";

export default function App() {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [events, setEvents] = useState([]);
  const [dataChannel, setDataChannel] = useState(null);
  const peerConnection = useRef(null);
  const audioElement = useRef(null);

  async function startSession() {
    // Create a peer connection
    const pc = new RTCPeerConnection();

    // Set up to play remote audio from the model
    audioElement.current = document.createElement("audio");
    audioElement.current.autoplay = true;
    pc.ontrack = (e) => (audioElement.current.srcObject = e.streams[0]);

    // Add local audio track for microphone input in the browser
    const ms = await navigator.mediaDevices.getUserMedia({
      audio: true,
    });
    pc.addTrack(ms.getTracks()[0]);

    // Set up data channel for sending and receiving events
    const dc = pc.createDataChannel("oai-events");
    setDataChannel(dc);

    // Start the session using the Session Description Protocol (SDP)
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete (OpenAI endpoint expects complete SDP, no trickle)
    await new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
      } else {
        const checkState = () => {
          if (pc.iceGatheringState === "complete") {
            pc.removeEventListener("icegatheringstatechange", checkState);
            resolve();
          }
        };
        pc.addEventListener("icegatheringstatechange", checkState);
      }
    });

    // Use server proxy to create the session so client doesn't need an ephemeral key
    const sdpResponse = await fetch(`/session`, {
      method: "POST",
      body: pc.localDescription.sdp,
      headers: {
        "Content-Type": "application/sdp",
      },
    });

    if (!sdpResponse.ok) {
      const errText = await sdpResponse.text();
      console.error("SDP exchange failed:", sdpResponse.status, errText);
      alert(`Failed to start session: ${sdpResponse.status}`);
      return;
    }

    const sdp = await sdpResponse.text();
    const answer = { type: "answer", sdp };
    await pc.setRemoteDescription(answer);

    peerConnection.current = pc;
  }

  // Stop current session, clean up peer connection and data channel
  function stopSession() {
    if (dataChannel) {
      dataChannel.close();
    }

    peerConnection.current.getSenders().forEach((sender) => {
      if (sender.track) {
        sender.track.stop();
      }
    });

    if (peerConnection.current) {
      peerConnection.current.close();
    }

    setIsSessionActive(false);
    setDataChannel(null);
    peerConnection.current = null;
  }

  // Send a message to the model
  function sendClientEvent(message) {
    if (dataChannel) {
      const timestamp = new Date().toLocaleTimeString();
      message.event_id = message.event_id || crypto.randomUUID();

      // send event before setting timestamp since the backend peer doesn't expect this field
      dataChannel.send(JSON.stringify(message));

      // if guard just in case the timestamp exists by miracle
      if (!message.timestamp) {
        message.timestamp = timestamp;
      }
      setEvents((prev) => [message, ...prev]);
    } else {
      console.error(
        "Failed to send message - no data channel available",
        message,
      );
    }
  }

  // Send a text message to the model
  function sendTextMessage(message) {
    const event = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [
          {
            type: "input_text",
            text: message,
          },
        ],
      },
    };

    sendClientEvent(event);
    sendClientEvent({
      type: "response.create",
      response: {
        modalities: ["audio", "text"],
        instructions: undefined
      }
    });
  }

  // Attach event listeners to the data channel when a new one is created
  useEffect(() => {
    if (dataChannel) {
      // Append new server events to the list
      dataChannel.addEventListener("message", (e) => {
        const event = JSON.parse(e.data);
        if (!event.timestamp) {
          event.timestamp = new Date().toLocaleTimeString();
        }

        setEvents((prev) => [event, ...prev]);

        // When the user's speech has been transcribed by the server, request a response
        if (event.type === "conversation.item.input_audio_transcription.completed") {
          // Trigger assistant turn so we get assistant audio/text + transcripts
          sendClientEvent({ type: "response.create" });
        }
      });

      // Set session active when the data channel is opened
      dataChannel.addEventListener("open", () => {
        setIsSessionActive(true);
        setEvents([]);
        
        // Enable input audio transcription when session starts
        sendClientEvent({
          type: "session.update",
          session: {
            input_audio_transcription: {
              model: "whisper-1"
            },
            instructions: `You are a friendly, professional receptionist in a medical clinic waiting room. Your role is to welcome patients, build comfort, and gather medical history before they meet the doctor.

Tone & Style: Warm, conversational, empathetic, clear, natural pace, avoid jargon. Check in so patients feel heard and understood.

Primary responsibilities:
1) Greeting & Comfort: Welcome the patient and explain the questions help the doctor provide better care.
2) Medical History Collection (conversational but structured):
   - Current symptoms or concerns
   - Past medical conditions or surgeries
   - Allergies
   - Medications (prescriptions, OTC, supplements)
   - Family health history
   - Lifestyle (diet, exercise, smoking, alcohol, stress)
3) Clarification: If answers are vague, gently follow up (e.g., "Could you tell me more about when that started?").
4) Documentation: Summarize the patient’s responses in a concise, structured format the doctor can review quickly at the end.

Boundaries: Do not diagnose or give medical advice. Focus on intake questions, empathetic listening, and preparing information for the physician.

Goal: Ensure the doctor has a full, accurate picture of the patient’s health context while making the patient feel comfortable and cared for. Respond in English unless the patient clearly prefers another language.`
          }
        });
      });
    }
  }, [dataChannel]);

  return (
    <>
      <nav className="absolute top-0 left-0 right-0 h-16 flex items-center">
        <div className="flex items-center gap-4 w-full m-4 pb-2 border-0 border-b border-solid border-gray-200">
          <img style={{ width: "24px" }} src={logo} />
          <h1>realtime console</h1>
        </div>
      </nav>
      <main className="absolute top-16 left-0 right-0 bottom-0">
        <section className="absolute top-0 left-0 right-[380px] bottom-0 flex">
          <section className="absolute top-0 left-0 right-0 bottom-32 px-4 overflow-y-auto">
            <EventLog events={events} />
          </section>
          <section className="absolute h-32 left-0 right-0 bottom-0 p-4">
            <SessionControls
              startSession={startSession}
              stopSession={stopSession}
              sendClientEvent={sendClientEvent}
              sendTextMessage={sendTextMessage}
              events={events}
              isSessionActive={isSessionActive}
            />
          </section>
        </section>
        <section className="absolute top-0 w-[380px] right-0 bottom-0 p-4 pt-0 overflow-y-auto">
          <TranscriptManager
            events={events}
            embedded={true}
          />
        </section>
      </main>
      
    </>
  );
}