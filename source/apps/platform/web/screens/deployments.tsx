import { useEffect } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import { Badge } from "@ritaj/ui";
import type { LiveDeployment } from "../api.ts";
import { Panel } from "../components/panel.tsx";
import * as Paths from "../paths.ts";
import type { DeploymentsData } from "../routes.tsx";

/** How often what is running is looked at again. */
const REFRESH_MS = 5_000;

type Color = "gray" | "green" | "blue" | "orange" | "red";

/** How each container state reads; one Docker adds later reads gray. */
const STATES: Readonly<Record<string, Color>> = {
  running: "green",
  restarting: "blue",
  created: "gray",
  paused: "gray",
  exited: "gray",
  removing: "gray",
  dead: "red",
};

/** A health check's verdict overrides the state it qualifies. */
const HEALTH: Readonly<Record<string, Color>> = {
  healthy: "green",
  starting: "orange",
  unhealthy: "red",
};

/** Every deployment running on the machine, whoever deployed it, looked at again every few seconds. */
export function Deployments() {
  const { deployments } = useLoaderData() as DeploymentsData;
  const { revalidate } = useRevalidator();

  useEffect(() => {
    const timer = setInterval(() => void revalidate(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [revalidate]);

  if (deployments.length === 0) {
    return (
      <Panel
        title="Nothing deployed"
        description="No compose stack ens deployed is on this machine's Docker."
      />
    );
  }
  return (
    <>
      {deployments.map((deployment) => (
        <DeploymentPanel key={deployment.name} deployment={deployment} />
      ))}
    </>
  );
}

function DeploymentPanel({ deployment }: { deployment: LiveDeployment }) {
  const { scope, services, hosts, project } = deployment;
  const running = services.filter((service) => service.state === "running")
    .length;

  return (
    <Panel
      title={scope.instance
        ? `${scope.manifest} · ${scope.instance}`
        : scope.manifest}
      description={<span className="font-mono">{scope.checkout}</span>}
      action={
        <div className="flex items-center gap-2">
          <Badge color={running === services.length ? "green" : "orange"}>
            {running}/{services.length} running
          </Badge>
          {project
            ? (
              <Link to={Paths.project(project)}>
                <Badge color="blue">{project}</Badge>
              </Link>
            )
            : <Badge color="gray">Unclaimed</Badge>}
        </div>
      }
    >
      {hosts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body">
          <span className="text-muted-foreground">Hosts</span>
          {hosts.map((host) =>
            host.includes("*")
              ? (
                <span key={host} className="font-mono text-caption">
                  {host}
                </span>
              )
              : (
                <a
                  key={host}
                  href={`https://${host}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-caption underline"
                >
                  {host}
                </a>
              )
          )}
        </div>
      )}
      <div className="grid gap-1">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex flex-wrap items-center gap-2 text-body"
          >
            <Badge
              variant="dot"
              color={HEALTH[service.health ?? ""] ?? STATES[service.state] ??
                "gray"}
            >
              {service.health
                ? `${service.state}, ${service.health}`
                : service.state}
            </Badge>
            <span className="font-medium">{service.name}</span>
            <span className="ml-auto truncate font-mono text-caption text-muted-foreground">
              {service.image}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}
