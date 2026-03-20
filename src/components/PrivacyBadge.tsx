import React from 'react';

const badgeStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: '20px',
  backgroundColor: '#e8f5e9',
  color: '#2e7d32',
  fontSize: '13px',
  fontWeight: 500,
};

const dotStyle: React.CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  backgroundColor: '#4caf50',
  animation: 'pulse 1.5s infinite',
};

export function PrivacyBadge({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
      <div style={badgeStyle}>
        <span style={dotStyle} />
        本地 AI 分析中，影像不會離開您的設備
      </div>
    </>
  );
}
