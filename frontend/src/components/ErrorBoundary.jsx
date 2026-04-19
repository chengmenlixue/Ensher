import React from 'react'
import { LangContext, translations } from '../i18n'

const t = (lang, key) => translations[lang]?.[key] || translations.en[key] || key;

class ErrorBoundary extends React.Component {
  static contextType = LangContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const lang = this.context || 'en';
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          background: 'var(--neu-bg)',
          fontFamily: 'sans-serif',
          flexDirection: 'column',
          gap: 16,
          padding: 32,
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h2 style={{ color: '#374151', margin: 0 }}>{t(lang, 'eb.title')}</h2>
          <p style={{ color: '#6b7280', fontSize: 14, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || t(lang, 'eb.unknown')}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 20px',
              borderRadius: 10,
              border: 'none',
              background: '#10b981',
              color: 'white',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            {t(lang, 'eb.reload')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
