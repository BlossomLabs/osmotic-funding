import { EthereumNetworkNames } from "./types";

const getNetworkNameById = (chainId: number): string => {
  const { rinkeby, goerli, xdai, polygon, mumbai } = EthereumNetworkNames;
  switch (chainId) {
    case 4:
      return rinkeby;
    case 5:
      return goerli;
    case 100:
      return xdai;
    case 137:
      return polygon;
    case 80001:
      return mumbai;
    default:
      return mumbai;
  }
};
const Config = {
  Bases: {
    [EthereumNetworkNames.goerli]: {
      cfav1: "0xEd6BcbF6907D4feEEe8a8875543249bEa9D308E8",
      host: "0x22ff293e14F1EC3A09B137e9e06084AFd63adDF9",
      requestSuperToken: "0xF2d68898557cCb2Cf4C10c3Ef2B034b2a69DAD00", // fDAIx
    },
    [EthereumNetworkNames.xdai]: {
      cfav1: "0xEbdA4ceF883A7B12c4E669Ebc58927FBa8447C7D",
      host: "0x2dFe937cD98Ab92e59cF3139138f18c823a4efE7",
      governance: "0xaCc7380323681fdb8a0B9F2FE7d69dDFf0664478",
      requestSuperToken: "0x59988e47A3503AaFaA0368b9deF095c818Fdca01", // xDAIx
    },
    [EthereumNetworkNames.polygon]: {
      cfav1: "0x6EeE6060f715257b970700bc2656De21dEdF074C",
      host: "0x3E14dC1b13c488a8d5D310918780c983bD5982E7",
      requestSuperToken: "0x1305F6B6Df9Dc47159D12Eb7aC2804d4A33173c2", // DAIx
    },
    [EthereumNetworkNames.mumbai]: {
      cfav1: "0x49e565Ed1bdc17F3d220f72DF0857C26FA83F873",
      host: "0xEB796bdb90fFA0f28255275e16936D25d3418603",
      requestSuperToken: "0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f", // fDAIx
    },
  },
};

export const getConfigByNetworkId = (
  chainId: number
): { cfav1: string; host: string; requestSuperToken: string } => {
  return Config.Bases[EthereumNetworkNames[getNetworkNameById(chainId)]];
};

export default Config;
