declare module "node-pty" {
  export type IPty = {
    pid: number;
    write(data: string): void;
    resize(cols: number, rows: number): void;
    kill(signal?: string): void;
    onData(listener: (data: string) => void): { dispose(): void };
    onExit(listener: (event: { exitCode: number; signal?: number }) => void): { dispose(): void };
  };
  export type SpawnOptions = {
    name?: string;
    cols?: number;
    rows?: number;
    cwd?: string;
    env?: Record<string, string | undefined>;
    encoding?: string | null;
  };
  export function spawn(file: string, args: string[] | string, options: SpawnOptions): IPty;
}
