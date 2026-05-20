import { Config } from '@remotion/cli/config';

Config.setPublicDir('./public');
Config.setEntryPoint('./src/index.tsx');
// Enable WebGL for React Three Fiber rendering
Config.setChromiumOpenGlRenderer('swiftshader');
