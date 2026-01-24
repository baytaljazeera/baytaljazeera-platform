"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(to bottom right, #01273C, #0B6B4C)',
      color: 'white',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center',
      direction: 'rtl',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 'bold', marginBottom: '1rem', color: '#D4AF37' }}>
        حدث خطأ
      </h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>
        {error.message || 'حدث خطأ غير متوقع'}
      </h2>
      <button
        onClick={reset}
        style={{
          padding: '0.75rem 1.5rem',
          background: '#D4AF37',
          color: '#01273C',
          borderRadius: '0.5rem',
          fontWeight: '600',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1rem'
        }}
      >
        إعادة المحاولة
      </button>
    </div>
  );
}
