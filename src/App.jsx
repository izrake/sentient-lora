import { useState } from 'react';
import ChatInterface from './components/ChatInterface';
import './App.css';

function App() {
  const [apiUrl, setApiUrl] = useState(localStorage.getItem('apiUrl') || '');
  const [isConfiguring, setIsConfiguring] = useState(!localStorage.getItem('apiUrl'));
  const [error, setError] = useState('');

  const handleApiSubmit = async (e) => {
    e.preventDefault();
    setError('');

    try {
      let formattedUrl = apiUrl.replace(/\/$/, '');
      
      // Ensure URL has protocol
      if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
        formattedUrl = 'http://' + formattedUrl;
      }

      // Validate URL format
      try {
        new URL(formattedUrl);
      } catch (error) {
        throw new Error('Please enter a valid URL');
      }

      console.log('Testing API connection to:', formattedUrl);

      // Update the proxy target through a special endpoint
      await fetch('/@vite/proxy-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ target: formattedUrl }),
      });

      // Test the connection
      const response = await fetch('/api/models', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });

      console.log('API test response:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API test failed:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        throw new Error('Could not connect to API');
      }

      const data = await response.json();
      console.log('API test data:', data);

      if (!data.available_models || !Array.isArray(data.available_models)) {
        throw new Error('Invalid API response format');
      }

      localStorage.setItem('apiUrl', formattedUrl);
      setApiUrl(formattedUrl);
      setIsConfiguring(false);
    } catch (error) {
      console.error('API configuration error:', error);
      setError(`Unable to connect to API: ${error.message}`);
    }
  };

  return (
    <div className="app">
      <header>
        <h1>LLM Chat Interface</h1>
        <div className="header-controls">
          {!isConfiguring && <span className="api-url">{apiUrl}</span>}
          <button onClick={() => setIsConfiguring(true)} className="config-button">
            Configure API
          </button>
        </div>
      </header>

      {isConfiguring ? (
        <div className="config-form">
          <form onSubmit={handleApiSubmit}>
            <input
              type="url"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="Enter API URL (e.g., http://provider.gpufarm.xyz:31617)"
              required
            />
            <button type="submit">Save</button>
          </form>
          {error && <p className="error-message">{error}</p>}
        </div>
      ) : (
        <ChatInterface apiUrl={apiUrl} />
      )}
    </div>
  );
}

export default App; 