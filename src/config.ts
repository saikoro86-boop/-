import "dotenv/config";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が .env に設定されていません`);
  }
  return value;
}

export const config = {
  targetUrl: requireEnv("TARGET_URL"),
  loginId: requireEnv("LOGIN_ID"),
  loginPassword: requireEnv("LOGIN_PASSWORD"),
  userDataDir: process.env.USER_DATA_DIR ?? "./user_data",
};
