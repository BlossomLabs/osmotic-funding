import { Menu, PageHeader, Space } from "antd";
import React from "react";
import { Link } from "react-router-dom";

// displays a page header

export default function Header({ route, setRoute }) {
  return (
    <PageHeader
      title={
        <Space>
          <img src="logo192.png" width="32" />
          osmotic funding
        </Space>
      }
      subTitle={
        <Menu style={{ textAlign: "center" }} selectedKeys={[route]} mode="horizontal">
          <Menu.Item key="/">
            <Link
              onClick={() => {
                setRoute("/");
              }}
              to="/"
            >
              Grants
            </Link>
          </Menu.Item>
          <Menu.Item key="/about">
            <a href="https://showcase.ethglobal.com/ethonline2021/osmotic-funding" target="_blank">
              About
            </a>
          </Menu.Item>
          <Menu.Item key="/contract">
            <Link
              onClick={() => {
                setRoute("/contract");
              }}
              to="/contract"
            >
              Contract
            </Link>
          </Menu.Item>
          <Menu.Item key="/subgraph">
            <Link
              onClick={() => {
                setRoute("/subgraph");
              }}
              to="/subgraph"
            >
              Subgraph
            </Link>
          </Menu.Item>
        </Menu>
      }
      style={{ cursor: "pointer" }}
    />
  );
}
