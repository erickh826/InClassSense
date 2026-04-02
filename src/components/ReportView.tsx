import React from 'react';
import ReactMarkdown from 'react-markdown';

interface ReportViewProps {
  markdown: string | null;
  loading: boolean;
}

const markdownComponents = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '1rem', color: '#0f172a' }}>
      {children}
    </h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '2rem 0 1rem', color: '#1e293b' }}>
      {children}
    </h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '1.25rem 0 0.75rem', color: '#334155' }}>
      {children}
    </h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p style={{ marginBottom: '1rem', color: '#334155' }}>{children}</p>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li style={{ marginBottom: '0.5rem' }}>{children}</li>
  ),
  hr: () => (
    <hr style={{ border: 'none', borderTop: '1px solid #e2e8f0', margin: '1.5rem 0' }} />
  ),
};

export function ReportView({ markdown, loading }: ReportViewProps) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
        正在生成報告…
      </div>
    );
  }

  if (!markdown) return null;

  const now = new Date();
  const timestamp = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;

  return (
    <div
      style={{
        maxWidth: '900px',
        margin: '0 auto',
        padding: '2.5rem',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        lineHeight: 1.8,
      }}
    >
      {/* Report badge + timestamp */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem' }}>
          生成時間：{timestamp}
        </p>
        <span
          style={{
            fontSize: '0.85rem',
            padding: '0.3rem 0.75rem',
            backgroundColor: '#dbeafe',
            color: '#1d4ed8',
            borderRadius: '999px',
            fontWeight: 600,
          }}
        >
          AI 分析報告
        </span>
      </div>

      <ReactMarkdown components={markdownComponents}>{markdown}</ReactMarkdown>
    </div>
  );
}
