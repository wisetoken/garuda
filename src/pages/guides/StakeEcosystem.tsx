import { Fragment, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { stakeCards } from './stake-content';
import { initializeStakeDialogs } from './stake-dialogs';
import './stake-ecosystem.css';

export function StakeEcosystem() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (root.current) return initializeStakeDialogs(root.current);
  }, []);

  return <div className="stake-ecosystem" ref={root}>
    <div className="stake-flow" aria-label="WISE Token, Signature Stakes and Garuda Extension">
      {stakeCards.map((item, index) => <Fragment key={item.key}>
        {index > 0 && <span className="flow-arrow" aria-hidden="true">→</span>}
        <article className={`stake-node${item.key === 'garuda' ? ' stake-node--garuda' : ''}`}>
          <span className="wise-token-mark"><img className={item.key === 'signature' ? 'wiseone-mark' : undefined} src={item.icon} width={52} height={52} alt="" /></span>
          <p className="label">{item.label}</p>
          <h3>{item.cardTitle}</h3>
          <button className="stake-open" type="button" data-stake-open={item.key} aria-label={`Learn about ${item.cardTitle}`} aria-haspopup="dialog" aria-controls={`stake-dialog-${item.key}`} aria-expanded="false"><span>Learn more ↗</span></button>
          <p>{item.description}</p>
        </article>
      </Fragment>)}
    </div>
    {stakeCards.map((item, index) => <dialog key={item.key} className="stake-dialog" id={`stake-dialog-${item.key}`} aria-labelledby={`stake-title-${item.key}`} aria-describedby={`stake-intro-${item.key}`}>
      <button type="button" className="stake-close" aria-label="Close details" autoFocus>×</button>
      <nav className="stake-modal-nav" aria-label="Component details">
        <button type="button" data-stake-direction="-1" aria-label="Previous component"><ArrowLeft aria-hidden="true" /></button>
        <span>{index + 1} / {stakeCards.length}</span>
        <button type="button" data-stake-direction="1" aria-label="Next component"><ArrowRight aria-hidden="true" /></button>
      </nav>
      <div className="stake-dialog-header">
        <div className="stake-dialog-icon"><img className={item.key === 'signature' ? 'wiseone-mark' : undefined} src={item.icon} width={96} height={96} alt="" /></div>
        <div><h2 id={`stake-title-${item.key}`}>{item.title}</h2><p className="stake-dialog-intro" id={`stake-intro-${item.key}`}>{item.intro}</p></div>
      </div>
      <div className="stake-explanations">{item.rows.map(([title, text]) => <div key={title}><h3>{title}</h3><p>{text}</p></div>)}</div>
      <a className="stake-detail-link" href={item.href}>{item.link} ↗</a>
    </dialog>)}
  </div>;
}
