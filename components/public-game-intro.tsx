import {publicGameInfo} from '@/lib/public-game-info.mjs';

export default function PublicGameIntro() {
  return <div className="public-game-intro">
    <h1>{publicGameInfo.title}</h1>
    <p>{publicGameInfo.description}</p>
    <p>{publicGameInfo.modes}</p>
    <nav className="public-game-links" aria-label="About Kamayuu">
      {publicGameInfo.links.map((link, i) => <span key={link.href}>
        {i > 0 && <span aria-hidden="true"> · </span>}<a href={link.href}>{link.label}</a>
      </span>)}
    </nav>
  </div>;
}
