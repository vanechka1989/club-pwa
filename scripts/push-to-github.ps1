$ErrorActionPreference = "Stop"

git config user.name "vanechka1989"
git config user.email "vanechka1989@users.noreply.github.com"

$remote = git remote
if ($remote -notcontains "origin") {
  git remote add origin "https://github.com/vanechka1989/club-pwa.git"
}

git branch -M main
git add .
git commit -m "Initial PWA club template"
git push -u origin main
