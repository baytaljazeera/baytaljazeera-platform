import { NextPageContext } from 'next';

interface ErrorProps {
  statusCode: number;
}

function Error({ statusCode }: ErrorProps) {
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
      direction: 'rtl'
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 'bold', marginBottom: '1rem', color: '#D4AF37' }}>
        {statusCode}
      </h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem' }}>
        {statusCode === 404 ? 'الصفحة غير موجودة' : 'حدث خطأ'}
      </h2>
      <a 
        href="/"
        style={{
          padding: '0.75rem 1.5rem',
          background: '#D4AF37',
          color: '#01273C',
          borderRadius: '0.5rem',
          fontWeight: '600',
          textDecoration: 'none'
        }}
      >
        العودة للرئيسية
      </a>
    </div>
  );
}

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
