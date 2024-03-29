import { Classes } from "@blueprintjs/core";
import Document, { DocumentContext, DocumentInitialProps, Head, Html, Main, NextScript } from "next/document";
import { parseCookies } from "nookies";

interface WikiStatDocumentProps extends DocumentInitialProps {
	languageCode: string;
}

class WikiStatDocument extends Document<WikiStatDocumentProps> {
	static async getInitialProps(ctx: DocumentContext): Promise<WikiStatDocumentProps> {
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
			<body className={Classes.getClassNamespace() + "-dark"}>
				<Main />
				<NextScript />
			</body>
		</Html>;
	}
}

export default WikiStatDocument;
