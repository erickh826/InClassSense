import ReactMarkdown from 'react-markdown';

interface ReportViewProps {
  markdown: string | null;
  loading: boolean;
}

export function ReportView({ markdown, loading }: ReportViewProps) {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem', color: '#888' }}>
        正在生成報告…
      </div>
    );
  }

  if (!markdown) return null;

  return (
    <div
      style={{
        padding: '1.5rem',
        backgroundColor: '#fff',
        borderRadius: '12px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        lineHeight: 1.8,
      }}
    >
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </div>
  );
}
