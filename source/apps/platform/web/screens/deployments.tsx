import { type ReactNode, useEffect } from "react";
import { Link, useLoaderData, useRevalidator } from "react-router";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useIcon,
} from "@ritaj/ui";
import type { LiveDeployment } from "../api.ts";
import { Panel } from "../components/panel.tsx";
import * as Paths from "../paths.ts";
import type { DeploymentsData } from "../routes.tsx";

/** How often what is running is looked at again. */
const REFRESH_MS = 5_000;

type Color = "gray" | "green" | "blue" | "orange" | "red";
type Service = LiveDeployment["services"][number];

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

/**
 * What a group of deployments has in common: the project they belong to, a
 * repository no project is yet, or nothing that can be told.
 */
type Owner =
  | { readonly kind: "project"; readonly project: string }
  | { readonly kind: "repository"; readonly repository: string }
  | { readonly kind: "unclaimed" };

/** Projects first, then repositories that could be, then the rest. */
const OWNER_ORDER: Readonly<Record<Owner["kind"], number>> = {
  project: 0,
  repository: 1,
  unclaimed: 2,
};

function ownerOf(deployment: LiveDeployment): Owner {
  if (deployment.project) {
    return { kind: "project", project: deployment.project };
  }
  if (deployment.repository) {
    return { kind: "repository", repository: deployment.repository };
  }
  return { kind: "unclaimed" };
}

/** What sets one owner apart, and sorts it within its kind. */
const OWNER_KEY: {
  readonly [K in Owner["kind"]]: (owner: Extract<Owner, { kind: K }>) => string;
} = {
  project: (owner) => owner.project,
  repository: (owner) => owner.repository.toLowerCase(),
  unclaimed: () => "",
};

function keyOf(owner: Owner): string {
  const key = (OWNER_KEY[owner.kind] as (owner: Owner) => string)(owner);
  return `${owner.kind}:${key}`;
}

/** Whether a service is anything but running and, when checked, healthy. */
function troubled(service: Service): boolean {
  if (service.state !== "running") return true;
  return service.health !== undefined && service.health !== "healthy";
}

function color(service: Service): Color {
  return HEALTH[service.health ?? ""] ?? STATES[service.state] ?? "gray";
}

/** Troubled services first, then by name, so problems lead each table. */
function byAttention(a: Service, b: Service): number {
  return Number(troubled(b)) - Number(troubled(a)) ||
    a.name.localeCompare(b.name);
}

function troubles(deployment: LiveDeployment): number {
  return deployment.services.filter(troubled).length;
}

interface Group {
  readonly owner: Owner;
  readonly deployments: LiveDeployment[];
}

/** Deployments by owner: projects, then repositories no project is yet, then unclaimed; troubled deployments lead each group. */
function groupByOwner(deployments: readonly LiveDeployment[]): Group[] {
  const groups = new Map<string, Group>();
  for (const deployment of deployments) {
    const owner = ownerOf(deployment);
    const key = keyOf(owner);
    const group = groups.get(key) ?? { owner, deployments: [] };
    group.deployments.push(deployment);
    groups.set(key, group);
  }
  for (const { deployments } of groups.values()) {
    deployments.sort((a, b) =>
      troubles(b) - troubles(a) || a.name.localeCompare(b.name)
    );
  }
  return [...groups.values()].sort((a, b) =>
    OWNER_ORDER[a.owner.kind] - OWNER_ORDER[b.owner.kind] ||
    keyOf(a.owner).localeCompare(keyOf(b.owner))
  );
}

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
    <div className="grid gap-8">
      <Summary deployments={deployments} />
      {groupByOwner(deployments).map((group) => (
        <OwnerGroup key={keyOf(group.owner)} group={group} />
      ))}
    </div>
  );
}

/** The machine at a glance: how much runs and how much of it needs a look. */
function Summary({ deployments }: { deployments: readonly LiveDeployment[] }) {
  const services = deployments.flatMap((deployment) => deployment.services);
  const attention = services.filter(troubled).length;

  return (
    <Panel
      title="Deployments"
      description="Every compose stack ens deployed on this machine, refreshed every few seconds."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Badge color="gray">
            {deployments.length} {deployments.length === 1 ? "stack" : "stacks"}
          </Badge>
          <Badge color="gray">
            {services.length} {services.length === 1 ? "service" : "services"}
          </Badge>
          <Badge variant="dot" color={attention === 0 ? "green" : "red"}>
            {attention === 0 ? "All healthy" : `${attention} need attention`}
          </Badge>
        </div>
      }
    />
  );
}

/** How each kind of owner heads its group. */
const OWNER_HEADINGS: {
  readonly [K in Owner["kind"]]: (
    props: { owner: Extract<Owner, { kind: K }> },
  ) => ReactNode;
} = {
  project: ({ owner }) => (
    <h2 className="text-body font-medium">
      <Link to={Paths.project(owner.project)} className="hover:underline">
        {owner.project}
      </Link>
    </h2>
  ),
  repository: ({ owner }) => <RepositoryHeading owner={owner} />,
  unclaimed: () => (
    <>
      <h2 className="text-body font-medium">Unclaimed</h2>
      <span className="text-caption text-muted-foreground">
        Not traced to a GitHub repository
      </span>
    </>
  ),
};

/** A repository deployed on the machine that no project is yet, with the way to make it one. */
function RepositoryHeading(
  { owner }: { owner: Extract<Owner, { kind: "repository" }> },
) {
  const AddIcon = useIcon("plus");
  return (
    <>
      <h2 className="font-mono text-body font-medium">{owner.repository}</h2>
      <span className="text-caption text-muted-foreground">Not a project</span>
      <Button
        className="ml-auto"
        size="compact"
        variant="secondary"
        leadingIcon={AddIcon}
        render={<Link to={Paths.newProjectOf(owner.repository)} />}
      >
        Add as project
      </Button>
    </>
  );
}

function OwnerGroup({ group }: { group: Group }) {
  const { owner, deployments } = group;
  const Heading = OWNER_HEADINGS[owner.kind] as (
    props: { owner: Owner },
  ) => ReactNode;
  return (
    <section className="grid gap-3">
      <header className="flex items-center gap-2 px-1">
        <Heading owner={owner} />
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {deployments.map((deployment) => (
          <DeploymentPanel key={deployment.name} deployment={deployment} />
        ))}
      </div>
    </section>
  );
}

function DeploymentPanel({ deployment }: { deployment: LiveDeployment }) {
  const { scope, services, hosts } = deployment;
  const trouble = troubles(deployment);

  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          {scope.manifest}
          {scope.instance && <Badge color="gray">{scope.instance}</Badge>}
        </span>
      }
      description={hosts.length > 0 ? <Hosts hosts={hosts} /> : "No hosts"}
      action={
        <Badge variant="dot" color={trouble === 0 ? "green" : "red"}>
          {trouble === 0
            ? `${services.length}/${services.length} up`
            : `${trouble}/${services.length} troubled`}
        </Badge>
      }
    >
      <Table size="compact">
        <TableHeader>
          <TableRow>
            <TableHead>Service</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Image</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...services].sort(byAttention).map((service, index) => (
            <TableRow key={service.name} index={index}>
              <TableCell className="font-medium">{service.name}</TableCell>
              <TableCell>
                <Badge variant="dot" color={color(service)}>
                  {service.health
                    ? `${service.state}, ${service.health}`
                    : service.state}
                </Badge>
              </TableCell>
              <TableCell
                className="max-w-0 truncate font-mono text-caption text-muted-foreground"
                title={service.image}
              >
                {service.image}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p
        className="truncate font-mono text-caption text-muted-foreground"
        title={scope.checkout}
      >
        {scope.checkout}
      </p>
    </Panel>
  );
}

/** Where a deployment answers: concrete hosts link out, wildcards can't. */
function Hosts({ hosts }: { hosts: readonly string[] }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-caption">
      {hosts.map((host) =>
        host.includes("*") ? <span key={host}>{host}</span> : (
          <a
            key={host}
            href={`https://${host}`}
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {host}
          </a>
        )
      )}
    </span>
  );
}
