//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withSentryConfig } = require('@sentry/nextjs');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  // Use this to set Nx-specific options
  // See: https://nx.dev/recipes/next/next-config-setup
  nx: {},
  // Emit a self-contained server.js under .next/standalone so the production
  // Docker image (infra/docker/Dockerfile.web) can run Next without shipping
  // the full node_modules tree. Safe in dev — Next dev ignores it.
  output: 'standalone',
};

const plugins = [
  // Add more Next.js plugins to this list if needed.
  withNx,
];

const config = composePlugins(...plugins)(nextConfig);

module.exports = withSentryConfig(config, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  telemetry: false,
});
