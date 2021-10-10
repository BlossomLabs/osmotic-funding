import { ApolloClient, ApolloProvider, InMemoryCache } from "@apollo/client";
import React from "react";
import { ThemeSwitcherProvider } from "react-css-theme-switcher";
import ReactDOM from "react-dom";
import { ApiProvider } from "react-use-api";
import App from "./App";
import "./index.css";

const themes = {
  dark: `${process.env.PUBLIC_URL}/dark-theme.css`,
  light: `${process.env.PUBLIC_URL}/light-theme.css`,
};

const prevTheme = window.localStorage.getItem("theme");

const subgraphUri = "http://localhost:8000/subgraphs/name/blossomlabs/osmotic-funding";

const client = new ApolloClient({
  uri: subgraphUri,
  cache: new InMemoryCache(),
});

ReactDOM.render(
  <ApolloProvider client={client}>
    <ApiProvider context={{ alwaysUseCache: true }}>
      <ThemeSwitcherProvider themeMap={themes} defaultTheme={prevTheme || "light"}>
        <App subgraphUri={subgraphUri} />
      </ThemeSwitcherProvider>
    </ApiProvider>
  </ApolloProvider>,
  document.getElementById("root"),
);
