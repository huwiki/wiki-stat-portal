import { Classes } from '@blueprintjs/core'
import Document, { Html, Head, Main, NextScript } from 'next/document'

class WikiStatDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx)
    return { ...initialProps }
  }

  render() {
    return (
      <Html>
        <Head />
        <body className={Classes.DARK}>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default WikiStatDocument;
