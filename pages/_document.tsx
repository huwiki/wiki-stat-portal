import Document, { DocumentInitialProps, Head, Html, Main, NextScript } from "next/document";
import { parseCookies } from "nookies";
import * as React from "react";

interface WikiStatDocumentProps extends DocumentInitialProps {
	languageCode: string;
}

class WikiStatDocument extends Document<WikiStatDocumentProps> {
	static async getInitialProps(ctx): Promise<WikiStatDocumentProps> {
		const initialProps = await Document.getInitialProps(ctx);
		const cookies = parseCookies(ctx);
		return {
			...initialProps,
			languageCode: cookies["languageCode"] || "en",
		};
	}

	render(): JSX.Element {
		return <Html>
			<Head />
			<body className="bp3-dark">
				<Main />
				<NextScript />
			</body>
		</Html>;
	}
}

export default WikiStatDocument;
