import { Octokit } from '@octokit/rest';
import { config } from '../config/env';
import { logger } from '../config/logger';

function getOctokit(): Octokit | null {
  if (!config.github.token || !config.github.repoOwner || !config.github.repoName) return null;
  return new Octokit({ auth: config.github.token });
}

export async function ensureBranch(branchName: string): Promise<boolean> {
  const octokit = getOctokit();
  if (!octokit) { logger.warn('GitHub not configured — skipping branch creation'); return false; }

  try {
    const { owner, repo } = { owner: config.github.repoOwner, repo: config.github.repoName };
    // Get default branch SHA
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
    await octokit.git.createRef({
      owner, repo,
      ref: `refs/heads/${branchName}`,
      sha: ref.object.sha,
    });
    logger.info('GitHub branch created', { branchName });
    return true;
  } catch (err: any) {
    if (err.status === 422) return true; // Already exists
    logger.warn('GitHub branch creation failed', { branchName, error: err.message });
    return false;
  }
}

export async function commitChapter(
  branchName:    string,
  chapterNumber: number,
  chapterTitle:  string,
  content:       string
): Promise<string | undefined> {
  const octokit = getOctokit();
  if (!octokit) return undefined;

  const { owner, repo } = { owner: config.github.repoOwner, repo: config.github.repoName };
  const padded   = String(chapterNumber).padStart(2, '0');
  const filePath = `chapters/chapter-${padded}.md`;

  try {
    await ensureBranch(branchName);

    let sha: string | undefined;
    try {
      const { data: existing } = await octokit.repos.getContent({ owner, repo, path: filePath, ref: branchName });
      sha = (existing as any).sha;
    } catch {}

    const { data } = await octokit.repos.createOrUpdateFileContents({
      owner, repo,
      path:    filePath,
      message: `Chapter ${padded}: ${chapterTitle}`,
      content: Buffer.from(content).toString('base64'),
      branch:  branchName,
      sha,
    });

    const commitSha = data.commit.sha;
    logger.info('Chapter committed to GitHub', { branchName, chapterNumber, commitSha });
    return commitSha;
  } catch (err: any) {
    logger.warn('GitHub commit failed (non-fatal)', { branchName, chapterNumber, error: err.message });
    return undefined;
  }
}

export const githubService = { ensureBranch, commitChapter };
