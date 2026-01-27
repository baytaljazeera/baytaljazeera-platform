function Error({ statusCode }) {
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
      <h1 style={{ fontSize: '6rem', fontWeight: 'bold', marginBottom: '1rem', color: '#D4AF37' }}>
        {statusCode || 'خطأ'}
      </h1>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem', color: 'rgba(255,255,255,0.8)' }}>
        {statusCode === 404 
          ? 'الصفحة غير موجودة' 
          : statusCode === 500 
            ? 'خطأ في الخادم' 
            : 'حدث خطأ غير متوقع'}
      </h2>
      <a 
        href="/"
        style={{
          padding: '0.75rem 2rem',
          background: '#D4AF37',
          color: '#01273C',
          borderRadius: '0.5rem',
          fontWeight: '600',
          textDecoration: 'none',
          fontSize: '1rem'
        }}
      >
        العودة للرئيسية
      </a>
    </div>
  )
}

Error.getInitialProps = ({ res, err }) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404
  return { statusCode }
}

export default Error
