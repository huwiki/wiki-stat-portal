import * as React from "react";
import { Classes } from "@blueprintjs/core";
import Document, { Html, Head, Main, NextScript, DocumentInitialProps } from "next/document";

class WikiStatDocument extends Document {
	static async getInitialProps(ctx): Promise<DocumentInitialProps> {
		const initialProps = await Document.getInitialProps(ctx);
		return { ...initialProps };
	}

	render(): JSX.Element {
		return <Html>
			<Head />
			<body className={Classes.DARK}>
				<Main />
				<NextScript />
			</body>
		</Html>;
	}
}

export default WikiStatDocument;
