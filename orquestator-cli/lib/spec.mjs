import { request } from "./linear.mjs";

const TEAM = `query($key:String!) {
  teams(filter:{key:{eq:$key}}, first:1) {
    nodes { id key states{ nodes{ id name } } }
  }
}`;

export async function createIssue(
  apiKey,
  { title, body, team = process.env.LINEAR_TEAM ?? "ESN" },
  fetchImpl = fetch,
) {
  const teamData = await request(apiKey, TEAM, { key: team }, fetchImpl);
  const found = teamData.teams.nodes[0];
  if (!found) throw new Error(`El equipo ${team} no existe en Linear`);
  const state = found.states.nodes.find((s) => s.name === "Spec review");
  if (!state)
    throw new Error(`El equipo ${team} no tiene el estado Spec review`);

  const data = await request(
    apiKey,
    `mutation($teamId:String!, $title:String!, $description:String, $stateId:String!) {
      issueCreate(input:{teamId:$teamId, title:$title, description:$description, stateId:$stateId}) {
        success issue { id identifier url }
      }
    }`,
    { teamId: found.id, title, description: body, stateId: state.id },
    fetchImpl,
  );
  if (!data.issueCreate?.success)
    throw new Error("La issue no se creó en Linear");
  return data.issueCreate.issue;
}
