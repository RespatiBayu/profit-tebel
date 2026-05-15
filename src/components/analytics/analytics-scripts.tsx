import Script from 'next/script'

interface AnalyticsScriptsProps {
  gaMeasurementId?: string
  clarityProjectId?: string
}

export function AnalyticsScripts({
  gaMeasurementId,
  clarityProjectId,
}: AnalyticsScriptsProps) {
  const hasGa = Boolean(gaMeasurementId)
  const hasClarity = Boolean(clarityProjectId)

  if (!hasGa && !hasClarity) {
    return null
  }

  return (
    <>
      {hasGa ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = window.gtag || gtag;
              gtag('js', new Date());
              gtag('config', '${gaMeasurementId}');
            `}
          </Script>
        </>
      ) : null}

      {hasClarity ? (
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);
              t.async=1;
              t.src="https://www.clarity.ms/tag/" + i;
              y=l.getElementsByTagName(r)[0];
              y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${clarityProjectId}");
          `}
        </Script>
      ) : null}
    </>
  )
}
