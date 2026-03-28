/**
 * Single source of truth for all deployable services.
 * Consumed by: aws/ CDK stacks, scripts/clone-projects.ts, GitHub Actions workflow.
 */

export type AwsDeployProject = {
  readonly id: string;
  readonly githubRepo: string;
  /** Directory name inside projects/ (e.g. "pickflix-v1" → projects/pickflix-v1) */
  readonly cloneDir: string;
  readonly ecrRepositoryName: string;
  /** FQDN for App Runner custom domain */
  readonly hostname: string;
  readonly port: number;
  /** Docker build context relative to clone dir */
  readonly dockerContext: string;
  readonly dockerfile: string;
  /** Built from this repo root, not from projects/ */
  readonly isPortfolio: boolean;
  /** Plain env vars injected at deploy time */
  readonly environment: Readonly<Record<string, string>>;
  /**
   * Env var names whose values come from SSM Parameter Store.
   * SSM path: /chrisvouga/{id}/{NAME}
   */
  readonly secrets: readonly string[];
};

export const DEPLOY_PROJECTS: readonly AwsDeployProject[] = [
  {
    id: "portfolio",
    githubRepo: "crvouga/chrisvouga.dev",
    cloneDir: "chrisvouga.dev",
    ecrRepositoryName: "portfolio",
    hostname: "www.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: true,
    environment: {},
    secrets: [],
  },
  {
    id: "pickflix",
    githubRepo: "crvouga/pickflix-v1",
    cloneDir: "pickflix-v1",
    ecrRepositoryName: "pickflix",
    hostname: "pickflix.chrisvouga.dev",
    port: 3000,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [
      "NODE_ENV",
      "PORT",
      "DATABASE_URL",
      "SECRET",
      "SEND_GRID_API_KEY",
      "SEND_GRID_REGISTERED_EMAIL_ADDRESS",
      "SESSION_COOKIE_SECRET",
      "YOUTUBE_API_KEY",
      "TMDB_API_READ_ACCESS_TOKEN",
    ],
  },
  {
    id: "headless-combobox-docs",
    githubRepo: "crvouga/headless-combobox",
    cloneDir: "headless-combobox",
    ecrRepositoryName: "headless-combobox-docs",
    hostname: "headlesscombobox.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "headless-combobox-svelte-example",
    githubRepo: "crvouga/headless-combobox",
    cloneDir: "headless-combobox",
    ecrRepositoryName: "headless-combobox-svelte-example",
    hostname: "svelte.headlesscombobox.chrisvouga.dev",
    port: 80,
    dockerContext: "example/svelte",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "moviefinder-app-rust",
    githubRepo: "crvouga/moviefinder.app-rust",
    cloneDir: "moviefinder.app-rust",
    ecrRepositoryName: "moviefinder-app-rust",
    hostname: "moviefinder-app-rust.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [
      "STAGE",
      "PORT",
      "TMDB_API_READ_ACCESS_TOKEN",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_SERVICE_SID",
    ],
  },
  {
    id: "moviefinder-app-go",
    githubRepo: "crvouga/moviefinder.app-go",
    cloneDir: "moviefinder.app-go",
    ecrRepositoryName: "moviefinder-app-go",
    hostname: "moviefinder-app-go.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [
      "STAGE",
      "PORT",
      "TMDB_API_READ_ACCESS_TOKEN",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_SERVICE_SID",
    ],
  },
  {
    id: "moviefinder-app-react",
    githubRepo: "crvouga/moviefinder.app-react",
    cloneDir: "moviefinder.app-react",
    ecrRepositoryName: "moviefinder-app-react",
    hostname: "moviefinder-app-react.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [
      "STAGE",
      "PORT",
      "TMDB_API_READ_ACCESS_TOKEN",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_SERVICE_SID",
    ],
  },
  {
    id: "moviefinder-app-clojurescript",
    githubRepo: "crvouga/moviefinder.app-clojurescript",
    cloneDir: "moviefinder.app-clojurescript",
    ecrRepositoryName: "moviefinder-app-clojurescript",
    hostname: "moviefinder-app-clojurescript.chrisvouga.dev",
    port: 8888,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [
      "PORT",
      "TMDB_API_READ_ACCESS_TOKEN",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_SERVICE_SID",
    ],
  },
  {
    id: "todo-app",
    githubRepo: "crvouga/todo-v1",
    cloneDir: "todo-v1",
    ecrRepositoryName: "todo-app",
    hostname: "todo.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "image-service",
    githubRepo: "crvouga/image-service",
    cloneDir: "image-service",
    ecrRepositoryName: "image-service",
    hostname: "imageservice.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "connect-four",
    githubRepo: "crvouga/connect-four",
    cloneDir: "connect-four",
    ecrRepositoryName: "connect-four",
    hostname: "connectfour.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "screenshot-service",
    githubRepo: "crvouga/screenshot-service",
    cloneDir: "screenshot-service",
    ecrRepositoryName: "screenshot-service",
    hostname: "screenshotservice.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "anime-blog",
    githubRepo: "crvouga/anime",
    cloneDir: "anime",
    ecrRepositoryName: "anime-blog",
    hostname: "anime.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "snake-game",
    githubRepo: "crvouga/snake",
    cloneDir: "snake",
    ecrRepositoryName: "snake-game",
    hostname: "snake.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "match-three",
    githubRepo: "crvouga/match-three",
    cloneDir: "match-three",
    ecrRepositoryName: "match-three",
    hostname: "matchthree.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "simon-says",
    githubRepo: "crvouga/simon-says",
    cloneDir: "simon-says",
    ecrRepositoryName: "simon-says",
    hostname: "simonsays.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "quiz-maker",
    githubRepo: "crvouga/quiz-maker",
    cloneDir: "quiz-maker",
    ecrRepositoryName: "quiz-maker",
    hostname: "quizmaker.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "cheese",
    githubRepo: "crvouga/cheese",
    cloneDir: "cheese",
    ecrRepositoryName: "cheese",
    hostname: "cheese.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
  {
    id: "smart-dog-door",
    githubRepo: "crvouga/smart-dog-door-python",
    cloneDir: "smart-dog-door-python",
    ecrRepositoryName: "smart-dog-door",
    hostname: "smartdogdoor.chrisvouga.dev",
    port: 80,
    dockerContext: ".",
    dockerfile: "Dockerfile",
    isPortfolio: false,
    environment: {},
    secrets: [],
  },
] as const;

export function getUniqueCloneRepos(): readonly { repo: string; dir: string }[] {
  const seen = new Set<string>();
  const out: { repo: string; dir: string }[] = [];
  for (const p of DEPLOY_PROJECTS) {
    if (p.isPortfolio || seen.has(p.githubRepo)) continue;
    seen.add(p.githubRepo);
    out.push({ repo: p.githubRepo, dir: p.cloneDir });
  }
  return out;
}
