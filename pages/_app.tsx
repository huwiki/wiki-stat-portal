import "../styles/globals.scss";
import "normalize.css/normalize.css";
import "@blueprintjs/icons/lib/css/blueprint-icons.css";
import "@blueprintjs/core/lib/css/blueprint.css";
import { Classes, Button, Navbar, NavbarDivider, NavbarGroup, NavbarHeading } from '@blueprintjs/core';

function WikiStatApp({ Component, pageProps }): JSX.Element {
  return <>
    <Navbar fixedToTop>
      <NavbarGroup>
        <NavbarHeading className="headerTitle">WikiStatPortal</NavbarHeading>
        <NavbarDivider />
        <Button minimal text="Funnel" icon="filter" />
      </NavbarGroup>
    </Navbar>
    <Component {...pageProps} />
  </>;
}

export default WikiStatApp;
