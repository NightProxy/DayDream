import axios from "axios";

//creds to crllect for writing the og commit date function from space v1

class Git {
  constructor(githubRepo) {
    let github = githubRepo.trim();
    github = github.replace(
      "https://github.com/",
      "https://api.github.com/repos/",
    );
    if (github.endsWith(".git")) {
      github = github.slice(0, -4);
    }
    github = github + (github.endsWith("/") ? "commits" : "/commits");

    this.repo = github;
  }

  async fetchLastCommitDate() {
    try {
      const response = await axios.get(this.repo);
      const commits = response.data;
      const lastCommitDate = new Date(commits[0].commit.committer.date);
      const formattedDate = lastCommitDate.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return formattedDate;
    } catch (error) {
      console.error("Error fetching the last commit date:", error);
      return null;
    }
  }

  async fetchLastCommitID() {
    try {
      const response = await axios.get(this.repo);
      const commits = response.data;
      const commitSha = commits[0].sha;
      const commitId = commitSha.slice(0, 7);
      return commitId;
    } catch (error) {
      console.error("Error fetching the last commit ID:", error);
      return null;
    }
  }
}

export default Git;
