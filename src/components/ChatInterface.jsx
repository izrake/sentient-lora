import React, { useState, useEffect, useRef } from 'react';

const ChatInterface = ({ apiUrl }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch available models when component mounts
  useEffect(() => {
    const fetchModels = async () => {
      try {
        setError(null);
        console.log('Fetching models...');
        
        const response = await fetch('/api/models', {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          }
        }).catch(error => {
          console.error('Fetch error:', error);
          throw error;
        });

        console.log('Response received:', response.status);

        if (!response.ok) {
          const errorText = await response.text().catch(e => 'Could not read error response');
          console.error('Error response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          });
          throw new Error(`HTTP error! status: ${response.status} - ${errorText}`);
        }

        const data = await response.json().catch(error => {
          console.error('JSON parse error:', error);
          throw new Error('Failed to parse response as JSON');
        });

        console.log('Models data:', data);

        if (!data || !data.available_models || !Array.isArray(data.available_models)) {
          console.error('Invalid data format:', data);
          throw new Error('Invalid response format from server');
        }

        setModels(data.available_models);
        if (data.available_models.length > 0) {
          setSelectedModel(data.available_models[0]);
        }
      } catch (error) {
        console.error('Error in fetchModels:', error);
        setError(`Failed to load models: ${error.message}`);
      }
    };

    fetchModels();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || !selectedModel) return;

    const userMessage = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: selectedModel,
          temperature: 0.7,
          max_tokens: 1000
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, there was an error processing your request.' 
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="error-container">
        <p className="error-message">{error}</p>
        <button onClick={() => window.location.reload()} className="retry-button">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="chat-container">
      <div className="model-selector">
        <select 
          value={selectedModel} 
          onChange={(e) => setSelectedModel(e.target.value)}
          disabled={loading || models.length === 0}
        >
          {models.length === 0 ? (
            <option value="">Loading models...</option>
          ) : (
            models.map(model => (
              <option key={model} value={model}>
                {model === 'dobby-8b' ? 'Dobby 8B' : 
                 model === 'llama3.1-8b' ? 'LLaMA 3.1 8B' : 
                 model}
              </option>
            ))
          )}
        </select>
      </div>

      <div className="messages">
        {messages.map((message, index) => (
          <div key={index} className={`message ${message.role}`}>
            <strong>{message.role === 'user' ? 'You' : 'Assistant'}:</strong>
            <p>{message.content}</p>
          </div>
        ))}
        {loading && <div className="message assistant loading">Generating response...</div>}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="input-form">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim() || !selectedModel}>
          {loading ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
};

export default ChatInterface; 