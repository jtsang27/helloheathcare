import React, { useState, useEffect, useRef } from 'react';
import { Download, Copy, Trash2, Eye, EyeOff } from 'lucide-react';

const TranscriptManager = ({ events, embedded = false }) => {
  const [transcript, setTranscript] = useState([]);
  const [isVisible, setIsVisible] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const transcriptRef = useRef(null);
  const processedEventIds = useRef(new Set());

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [transcript, autoScroll]);

  // Process events from the main app
  useEffect(() => {
    if (!events || events.length === 0) {
      setTranscript([]);
      processedEventIds.current.clear();
      return;
    }

    // Only process the most recent event to avoid reprocessing history on every change
    const event = events[0];
    if (!event || processedEventIds.current.has(event.event_id)) {
      return;
    }

      let transcriptEntry = null;

      switch (event.type) {
        // ===== User text messages (typed) =====
        case 'conversation.item.create':
          // Handle text messages sent by user
          if (event.item?.type === 'message' && event.item?.role === 'user') {
            const content = event.item.content?.[0];
            if (content?.type === 'input_text' && content?.text) {
              transcriptEntry = {
                id: event.event_id || Date.now() + Math.random(),
                speaker: 'user',
                message: content.text,
                timestamp: new Date(),
                type: 'user'
              };
            }
          }
          break;

        // ===== User audio transcription (partial/live) =====
        case 'conversation.item.input_audio_transcription.delta': {
          const deltaText = event.delta || event.text;
          if (deltaText) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.type === 'user' && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: lastEntry.message + deltaText }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'user',
                  message: deltaText,
                  timestamp: new Date(),
                  type: 'user',
                  isPartial: true
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;
        }

        // Handle user audio transcription from different event names
        case 'input_audio_buffer.speech_started':
          // Mark that user is speaking - could add visual indicator
          return;

        case 'input_audio_buffer.speech_stopped':
          // Mark that user stopped speaking - could add visual indicator  
          return;

        case 'input_audio_buffer.committed':
          // Audio buffer committed, transcription should follow
          return;

        // Some runtimes emit buffer-level transcription deltas
        case 'input_audio_buffer.transcription.delta': {
          const deltaText = event.delta || event.text;
          if (deltaText) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.type === 'user' && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: lastEntry.message + deltaText }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'user',
                  message: deltaText,
                  timestamp: new Date(),
                  type: 'user',
                  isPartial: true
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;
        }

        // ===== User audio transcription (final) =====
        case 'conversation.item.input_audio_transcription.completed':
          // Handle user audio transcription
          if (event.transcript) {
            transcriptEntry = {
              id: event.event_id || Date.now() + Math.random(),
              speaker: 'user',
              message: event.transcript,
              timestamp: new Date(),
              type: 'user'
            };
          }
          break;

        // Handle conversation item creation for user audio
        case 'conversation.item.added':
          if (event.item?.type === 'message' && event.item?.role === 'user') {
            const content = event.item.content?.[0];
            if (content?.type === 'input_audio' && content?.transcript) {
              transcriptEntry = {
                id: event.event_id || Date.now() + Math.random(),
                speaker: 'user',
                message: content.transcript,
                timestamp: new Date(),
                type: 'user'
              };
            }
          }
          break;

        case 'input_audio_buffer.transcription.completed':
          if (event.transcript) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.type === 'user' && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: event.transcript, isPartial: false }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'user',
                  message: event.transcript,
                  timestamp: new Date(),
                  type: 'user'
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;

        // ===== Assistant audio transcript (partial/live) =====
        case 'response.audio_transcript.delta':
          // Handle partial assistant transcription
          if (event.delta) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.type === 'assistant' && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: lastEntry.message + event.delta }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'assistant',
                  message: event.delta,
                  timestamp: new Date(),
                  type: 'assistant',
                  isPartial: true
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;

        // ===== Assistant audio transcript (partial/live) - alt name =====
        case 'response.output_audio_transcript.delta': {
          const delta = event.delta || event.text;
          if (delta) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.type === 'assistant' && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: lastEntry.message + delta }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'assistant',
                  message: delta,
                  timestamp: new Date(),
                  type: 'assistant',
                  isPartial: true
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;
        }

        // ===== Assistant audio transcript (final) =====
        case 'response.audio_transcript.done':
          // Handle complete assistant transcription
          if (event.transcript) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: event.transcript, isPartial: false }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'assistant',
                  message: event.transcript,
                  timestamp: new Date(),
                  type: 'assistant'
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;

        // ===== Assistant audio transcript (final) - alt name =====
        case 'response.output_audio_transcript.done': {
          const text = event.transcript || event.text;
          if (text) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: text, isPartial: false }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'assistant',
                  message: text,
                  timestamp: new Date(),
                  type: 'assistant'
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;
        }

        // ===== Assistant text (partial/live) =====
        case 'response.text.delta':
          // Handle partial assistant text response
          if (event.delta) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.type === 'assistant' && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: lastEntry.message + event.delta }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'assistant',
                  message: event.delta,
                  timestamp: new Date(),
                  type: 'assistant',
                  isPartial: true
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;

        // Common alternative event names for text
        case 'response.output_text.delta': {
          const delta = event.delta || event.text;
          if (delta) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.type === 'assistant' && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: lastEntry.message + delta }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'assistant',
                  message: delta,
                  timestamp: new Date(),
                  type: 'assistant',
                  isPartial: true
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;
        }

        case 'response.text.done':
          // Handle complete assistant text response
          if (event.text) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: event.text, isPartial: false }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'assistant',
                  message: event.text,
                  timestamp: new Date(),
                  type: 'assistant'
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;

        case 'response.output_text.done': {
          const text = event.text || event.output_text || event.transcript;
          if (text) {
            setTranscript(prev => {
              const lastEntry = prev[prev.length - 1];
              if (lastEntry && lastEntry.isPartial) {
                return [
                  ...prev.slice(0, -1),
                  { ...lastEntry, message: text, isPartial: false }
                ];
              } else {
                return [...prev, {
                  id: event.event_id || Date.now() + Math.random(),
                  speaker: 'assistant',
                  message: text,
                  timestamp: new Date(),
                  type: 'assistant'
                }];
              }
            });
            processedEventIds.current.add(event.event_id);
          }
          return;
        }
      }

      // Add transcript entry if one was created
      if (transcriptEntry) {
        setTranscript(prev => [...prev, transcriptEntry]);
        processedEventIds.current.add(event.event_id);
      }
  
  }, [events]);

  // Export transcript as text file
  const exportTranscript = () => {
    const transcriptText = transcript.map(entry => {
      const time = entry.timestamp.toLocaleTimeString();
      const speaker = entry.speaker.charAt(0).toUpperCase() + entry.speaker.slice(1);
      return `[${time}] ${speaker}: ${entry.message}`;
    }).join('\n\n');

    const blob = new Blob([transcriptText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-transcript-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Copy transcript to clipboard
  const copyTranscript = async () => {
    const transcriptText = transcript.map(entry => {
      const time = entry.timestamp.toLocaleTimeString();
      const speaker = entry.speaker.charAt(0).toUpperCase() + entry.speaker.slice(1);
      return `[${time}] ${speaker}: ${entry.message}`;
    }).join('\n\n');

    try {
      await navigator.clipboard.writeText(transcriptText);
      alert('Transcript copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy transcript:', err);
    }
  };

  // Clear transcript
  const clearTranscript = () => {
    if (confirm('Are you sure you want to clear the transcript?')) {
      setTranscript([]);
    }
  };

  if (!embedded && !isVisible) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setIsVisible(true)}
          className="bg-blue-500 hover:bg-blue-600 text-white p-3 rounded-full shadow-lg transition-colors"
          title="Show Transcript"
        >
          <Eye size={20} />
        </button>
      </div>
    );
  }

  const containerClass = embedded
    ? "w-full h-full bg-white border border-gray-300 rounded-lg shadow-lg flex flex-col"
    : "fixed right-4 top-4 w-80 h-96 bg-white border border-gray-300 rounded-lg shadow-lg flex flex-col z-50";

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <h3 className="font-semibold text-gray-800">Conversation Transcript</h3>
        <div className="flex items-center gap-2">
          <label className="flex items-center text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="mr-1"
            />
            Auto-scroll
          </label>
          {!embedded && (
            <button
              onClick={() => setIsVisible(false)}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title="Hide Transcript"
            >
              <EyeOff size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Transcript Content */}
      <div
        ref={transcriptRef}
        className="flex-1 overflow-y-auto p-3 space-y-3 bg-gray-50"
      >
        {transcript.length === 0 ? (
          <div className="text-gray-500 text-sm text-center">
            No conversation yet. Start talking!
          </div>
        ) : (
          transcript.map((entry) => (
            <div
              key={entry.id}
              className={`p-2 rounded-lg text-sm ${
                entry.type === 'user'
                  ? 'bg-blue-100 ml-4'
                  : 'bg-gray-200 mr-4'
              } ${entry.isPartial ? 'opacity-75 border-l-2 border-yellow-400' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-xs text-gray-600">
                  {entry.speaker === 'user' ? 'You' : 'Assistant'}
                </span>
                <span className="text-xs text-gray-500">
                  {entry.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className="text-gray-800">
                {entry.message}
                {entry.isPartial && <span className="animate-pulse">|</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between p-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
        <div className="text-xs text-gray-500">
          {transcript.length} messages
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyTranscript}
            className="text-gray-600 hover:text-blue-600 transition-colors"
            title="Copy Transcript"
            disabled={transcript.length === 0}
          >
            <Copy size={16} />
          </button>
          <button
            onClick={exportTranscript}
            className="text-gray-600 hover:text-green-600 transition-colors"
            title="Download Transcript"
            disabled={transcript.length === 0}
          >
            <Download size={16} />
          </button>
          <button
            onClick={clearTranscript}
            className="text-gray-600 hover:text-red-600 transition-colors"
            title="Clear Transcript"
            disabled={transcript.length === 0}
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TranscriptManager;