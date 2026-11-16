/** Web stub for MetaMask SDK's optional React Native peer. */
const mem = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string) => (mem.has(key) ? mem.get(key)! : null),
  setItem: async (key: string, value: string) => {
    mem.set(key, String(value));
  },
  removeItem: async (key: string) => {
    mem.delete(key);
  },
  clear: async () => {
    mem.clear();
  },
  getAllKeys: async () => [...mem.keys()],
};

export default AsyncStorage;
