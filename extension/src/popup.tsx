import React from 'react';
import ReactDOM from 'react-dom/client';
import './popup.css';

const Popup = () => {
  return (
    <div className="popup">
      <h1>PR Code Review Assistant</h1>
      <p>Your PR review helper is ready!</p>
    </div>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <Popup />
    </React.StrictMode>
  );
} 