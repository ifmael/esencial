const ENDPOINT = "https://api.linear.app/graphql";

export async function request(
  apiKey,
  query,
  variables = {},
  fetchImpl = fetch,
) {
  const res = await fetchImpl(ENDPOINT, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Linear respondió HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Linear: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  return json.data;
}

const ISSUE = `query($team:String!, $number:Float!) {
  issues(filter:{team:{key:{eq:$team}}, number:{eq:$number}}, first:1) {
    nodes { id identifier title description state{id name} team{id key} }
  }
}`;

export async function getIssue(apiKey, key, fetchImpl = fetch) {
  const match = /^([A-Z][A-Z0-9]{1,5})-(\d+)$/.exec(key);
  if (!match) throw new Error(`Clave inválida: ${key}`);
  const data = await request(
    apiKey,
    ISSUE,
    { team: match[1], number: Number(match[2]) },
    fetchImpl,
  );
  const issue = data.issues.nodes[0];
  if (!issue) throw new Error(`La issue ${key} no existe en Linear`);
  return issue;
}

export async function setState(apiKey, issue, stateName, fetchImpl = fetch) {
  const data = await request(
    apiKey,
    `query($id:String!){ team(id:$id){ states{nodes{id name}} } }`,
    { id: issue.team.id },
    fetchImpl,
  );
  const state = data.team.states.nodes.find((s) => s.name === stateName);
  if (!state) {
    throw new Error(
      `El equipo ${issue.team.key} no tiene el estado ${stateName}`,
    );
  }
  await request(
    apiKey,
    `mutation($id:String!, $stateId:String!){ issueUpdate(id:$id, input:{stateId:$stateId}){ success } }`,
    { id: issue.id, stateId: state.id },
    fetchImpl,
  );
}

export async function comment(apiKey, issue, body, fetchImpl = fetch) {
  await request(
    apiKey,
    `mutation($issueId:String!, $body:String!){ commentCreate(input:{issueId:$issueId, body:$body}){ success } }`,
    { issueId: issue.id, body },
    fetchImpl,
  );
}
