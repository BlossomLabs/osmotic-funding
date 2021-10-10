# Osmotic Funding

A protocol built on top of Superfluid Finance and Conviction Voting to create and regulate project funding streams based on the amount of interest a community has on them.

![image](./packages/react-app/public/stele.png)

# 🏄‍♂️ Quick Start

Prerequisites: [Node](https://nodejs.org/en/download/) plus [Yarn](https://classic.yarnpkg.com/en/docs/install/) and [Git](https://git-scm.com/downloads)

> clone/fork:

```bash
git clone https://github.com/BlossomLabs/osmotic-funding.git
```

> install and start 👷‍ Hardhat chain:

```bash
cd osmotic-funding
yarn install
yarn chain
```

> in a second terminal window, start 📱 frontend:

```bash
cd osmotic-funding
yarn start
```

> in a third terminal window, 🛰 deploy contracts:

```bash
cd osmotic-funding
yarn deploy
```

📱 Open http://localhost:3000 to see the app.

## Superfluid integration: Adaptive flow

We have implemented an advanced feature that integrates with [Superfluid](https://www.superfluid.finance) to create an adaptive payment flow.

> to play with it checkout the `superfluid-osmotic-funding` branch.

```bash
git checkout superfluid-osmotic-funding
```
