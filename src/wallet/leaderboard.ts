import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { CONFIG } from '../config';
import { apeChain, somnia } from '../lib/chains';
import { frostAbi } from '../lib/frostAbi';

type ScoreEntry = {
  player: Address;
  score: number;
  timestamp: number;
  nickname?: string;
};

const ZERO = '0x0000000000000000000000000000000000000000';

function escapeHtml(value: string) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function shortenAddress(addr: string) {
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function normalizeNickname(value: string) {
  return String(value || '').trim();
}

function displayNameFor(addr: string, nickname: string) {
  const n = normalizeNickname(nickname);
  return n || shortenAddress(addr);
}

function getRpcCandidates(networkKey: string, configured: string): string[] {
  const candidates: string[] = [];
  const add = (url: string) => {
    const u = String(url).trim();
    if (u && !candidates.includes(u)) candidates.push(u);
  };
  add(configured);
  if (networkKey === 'somnia') {
    add('https://api.infra.mainnet.somnia.network/');
    add('https://somnia.publicnode.com/');
    add('https://somnia-json-rpc.stakely.io/');
  }
  if (networkKey === 'ape') {
    add('https://rpc.apechain.com/http');
    add('https://apechain.calderachain.xyz/http');
    add('https://apechain.drpc.org');
  }
  return candidates;
}

async function tryReadNickname(
  client: PublicClient,
  contractAddress: Address,
  player: Address
): Promise<string> {
  try {
    const nick = await client.readContract({
      address: contractAddress,
      abi: frostAbi,
      functionName: 'nicknameOf',
      args: [player],
    });
    return normalizeNickname(nick as string);
  } catch {
    return '';
  }
}

function getValidEntries(entries: ScoreEntry[]) {
  return entries
    .filter((e) => e.player !== ZERO && Number(e.score) > 0)
    .sort((a, b) => Number(b.score) - Number(a.score));
}

async function readLeaderboardFromClient(
  client: PublicClient,
  contractAddress: Address
): Promise<{ sorted: ScoreEntry[]; top10: ScoreEntry[]; total: number }> {
  let board: ScoreEntry[] = [];
  try {
    const raw = (await client.readContract({
      address: contractAddress,
      abi: frostAbi,
      functionName: 'getLeaderboard',
    })) as readonly { player: Address; score: number; timestamp: number }[];
    board = raw.map((r) => ({
      player: r.player,
      score: Number(r.score),
      timestamp: Number(r.timestamp),
    }));
  } catch {
    const countRaw = await client.readContract({
      address: contractAddress,
      abi: frostAbi,
      functionName: 'entriesCount',
    });
    const count = Math.min(Number(countRaw) || 0, 100);
    if (count > 0) {
      const rows = await Promise.all(
        Array.from({ length: count }, (_, i) =>
          client.readContract({
            address: contractAddress,
            abi: frostAbi,
            functionName: 'leaderboard',
            args: [BigInt(i)],
          })
        )
      );
      board = rows.map((row) => {
        const r = row as readonly [`0x${string}`, number, number];
        return {
          player: r[0] as Address,
          score: Number(r[1]),
          timestamp: Number(r[2]),
        };
      });
    }
  }

  const sorted = getValidEntries(board);
  const top10Raw = sorted.slice(0, 10);
  const top10 = await Promise.all(
    top10Raw.map(async (entry) => ({
      ...entry,
      nickname: await tryReadNickname(client, contractAddress, entry.player),
    }))
  );

  let total = 0;
  try {
    const g = await client.readContract({
      address: contractAddress,
      abi: frostAbi,
      functionName: 'globalTotalScore',
    });
    total = Number(g);
  } catch {
    total = sorted.reduce((sum, item) => sum + Number(item.score), 0);
  }

  return { sorted, top10, total };
}

async function fetchLeaderboardViaRpc(
  networkKey: 'ape' | 'somnia',
  rpcUrl: string,
  contractAddress: string
): Promise<{ top10: ScoreEntry[]; total: number }> {
  if (!contractAddress || /^0x0{40}$/i.test(contractAddress)) {
    throw new Error('Missing contract address');
  }
  const chain = networkKey === 'ape' ? apeChain : somnia;
  const candidates = getRpcCandidates(networkKey, rpcUrl);
  let lastErr: unknown = null;

  for (const url of candidates) {
    try {
      const client = createPublicClient({
        chain,
        transport: http(url),
      });
      return await readLeaderboardFromClient(client, contractAddress as Address);
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error('RPC failed');
}

function setTeamTotal(el: HTMLElement | null, title: string, value: number | string, isError = false) {
  if (!el) return;
  if (isError) el.textContent = `${title}: N/A`;
  else el.textContent = `${title}: ${value}`;
}

function setSideTopList(
  el: HTMLOListElement | null,
  entries: ScoreEntry[],
  hasError = false
) {
  if (!el) return;
  if (hasError) {
    el.textContent = '';
    const li = document.createElement('li');
    li.textContent = 'N/A';
    el.appendChild(li);
    return;
  }
  if (!entries?.length) {
    el.textContent = '';
    const li = document.createElement('li');
    li.textContent = 'No scores yet';
    el.appendChild(li);
    return;
  }
  el.textContent = '';
  entries.slice(0, 10).forEach((entry) => {
    const li = document.createElement('li');
    li.textContent = `${displayNameFor(entry.player, entry.nickname ?? '')}: ${entry.score}`;
    el.appendChild(li);
  });
}

export async function refreshBattleTotalsDOM(): Promise<void> {
  const apeTotalEl = document.getElementById('ape-total');
  const somniaTotalEl = document.getElementById('somnia-total');
  const apeTopListEl = document.getElementById('ape-top-list') as HTMLOListElement | null;
  const somniaTopListEl = document.getElementById('somnia-top-list') as HTMLOListElement | null;

  try {
    const [apeData, somniaData] = await Promise.allSettled([
      fetchLeaderboardViaRpc('ape', CONFIG.APECHAIN_RPC_URL, CONFIG.APECHAIN_CONTRACT_ADDRESS),
      fetchLeaderboardViaRpc('somnia', CONFIG.SOMNIA_RPC_URL, CONFIG.CONTRACT_ADDRESS),
    ]);

    if (apeData.status === 'fulfilled') {
      setTeamTotal(apeTotalEl, 'Total', apeData.value.total, false);
      setSideTopList(apeTopListEl, apeData.value.top10, false);
    } else {
      setTeamTotal(apeTotalEl, 'Total', 0, true);
      setSideTopList(apeTopListEl, [], true);
    }

    if (somniaData.status === 'fulfilled') {
      setTeamTotal(somniaTotalEl, 'Total', somniaData.value.total, false);
      setSideTopList(somniaTopListEl, somniaData.value.top10, false);
    } else {
      setTeamTotal(somniaTotalEl, 'Total', 0, true);
      setSideTopList(somniaTopListEl, [], true);
    }
  } catch {
    setTeamTotal(apeTotalEl, 'Total', 0, true);
    setTeamTotal(somniaTotalEl, 'Total', 0, true);
    setSideTopList(apeTopListEl, [], true);
    setSideTopList(somniaTopListEl, [], true);
  }
}

export async function openBattleLeaderboardModal(): Promise<void> {
  document.getElementById('leaderboard-modal')?.remove();

  try {
    const [apeData, somniaData] = await Promise.allSettled([
      fetchLeaderboardViaRpc('ape', CONFIG.APECHAIN_RPC_URL, CONFIG.APECHAIN_CONTRACT_ADDRESS),
      fetchLeaderboardViaRpc('somnia', CONFIG.SOMNIA_RPC_URL, CONFIG.CONTRACT_ADDRESS),
    ]);

    const renderList = (dataResult: PromiseSettledResult<{ top10: ScoreEntry[]; total: number }>) => {
      if (dataResult.status !== 'fulfilled') {
        return '<p>Data unavailable. Set RPC + contract in config.</p>';
      }
      if (!dataResult.value.top10.length) return '<p>No scores yet</p>';
      const listItems = dataResult.value.top10
        .map(
          (e) =>
            `<li>${escapeHtml(displayNameFor(e.player, e.nickname ?? ''))}: ${Number(e.score)}</li>`
        )
        .join('');
      return `<ol>${listItems}</ol>`;
    };

    const html = `<h3>Frost Click Network Battle</h3>
      <div class="battle-modal-grid">
        <div class="battle-modal-col">
          <h4>ApeChain Top 10</h4>
          <p><strong>Total:</strong> ${apeData.status === 'fulfilled' ? apeData.value.total : 'N/A'}</p>
          ${renderList(apeData)}
        </div>
        <div class="battle-modal-col">
          <h4>Somnia Top 10</h4>
          <p><strong>Total:</strong> ${somniaData.status === 'fulfilled' ? somniaData.value.total : 'N/A'}</p>
          ${renderList(somniaData)}
        </div>
      </div>
      <button id="close-lb" type="button">Close</button>`;

    const modal = document.createElement('div');
    modal.id = 'leaderboard-modal';
    modal.className = 'battle-modal';
    modal.innerHTML = html;
    document.body.appendChild(modal);

    document.getElementById('close-lb')?.addEventListener('click', () => modal.remove());
    await refreshBattleTotalsDOM();
  } catch (err) {
    console.error(err);
    alert('Error fetching battle leaderboard');
  }
}
