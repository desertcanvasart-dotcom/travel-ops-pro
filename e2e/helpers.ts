import path from 'path'

// Cookie session captured by auth.setup.ts, consumed by the authed suite.
export const STORAGE_STATE = path.join(__dirname, '.auth', 'user.json')
