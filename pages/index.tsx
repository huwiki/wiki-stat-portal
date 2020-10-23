import { Button, Icon } from "@blueprintjs/core";
import Head from "next/head";
import styles from "../styles/Home.module.scss";

const Home = (): JSX.Element => <div className={styles.container}>
  <Head>
    <title>Create Next App</title>
    <link rel="icon" href="/favicon.ico" />
  </Head>
  Cica2
  <Button icon="download">Cica</Button>
  <Icon icon="download" iconSize={20} />
</div>;

export default Home;