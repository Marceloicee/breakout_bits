"use strict";
(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Não foi possível inicializar o Canvas 2D.");

  const ui = {
    score: document.getElementById("score"), level: document.getElementById("level"),
    lives: document.getElementById("lives"), overlay: document.getElementById("overlay"),
    tag: document.getElementById("overlay-tag"), title: document.getElementById("overlay-title"),
    message: document.getElementById("overlay-message"), button: document.getElementById("start-button"),
    announcement: document.getElementById("announcement")
  };

  const STATE = Object.freeze({ MENU:"menu", READY:"ready", PLAYING:"playing", PAUSED:"paused", GAMEOVER:"gameover", VICTORY:"victory" });
  const C = Object.freeze({ W:480, H:600, LIVES:3, PADDLE_W:86, PADDLE_MIN:48, PADDLE_H:12, PADDLE_Y:542,
    PADDLE_SPEED:420, BALL_R:7, BALL_SPEED:300, BALL_MAX:520, LEVEL_SPEED:20, DT_MAX:0.033,
    BRICK_Y:70, BRICK_H:20, BRICK_GAP:6, BRICK_MARGIN:16, MAX_LEVEL:5, POINTS:[50,40,30,20,10] });
  const COLORS = Object.freeze({ bg:"#000000", ball:"#FFFFFF", paddle:"#FBBF24", rows:["#EF4444","#F97316","#EAB308","#22C55E","#3B82F6"] });
  const LAYOUTS = [
    ["#..####..#",".########.","##########","###.##.###","##########"],
    ["...####...","..######..",".###..###.","##..##..##","##########"],
    ["#.#.##.#.#",".########.","##.####.##",".###..###.","##########"],
    ["##......##",".###..###.","##########","##.####.##",".########."],
    ["#..#..#..#",".########.","##.####.##","###.##.###","##########"]
  ];

  let state = STATE.MENU, previousState = STATE.MENU, score = 0, lives = C.LIVES, level = 1;
  let bricks = [], particles = [], lastTime = 0, scoreTimer = 0, paddleFlash = 0, announcementTimer = 0;
  const keys = Object.create(null);
  const paddle = { x:(C.W-C.PADDLE_W)/2, y:C.PADDLE_Y, w:C.PADDLE_W, h:C.PADDLE_H, speed:C.PADDLE_SPEED };
  const ball = { x:0, y:0, r:C.BALL_R, vx:0, vy:0, speed:C.BALL_SPEED, launched:false };

  function setState(next) { state = next; }
  function buildBricks() {
    bricks = [];
    const layout = LAYOUTS[(level - 1) % LAYOUTS.length];
    const columns = Math.max(...layout.map(row => row.length));
    const cell = (C.W - C.BRICK_MARGIN * 2) / columns;
    const width = cell - C.BRICK_GAP;
    layout.forEach((layoutRow, row) => [...layoutRow].forEach((cellValue, col) => {
      if (cellValue === "#") bricks.push({ x:C.BRICK_MARGIN + col*cell, y:C.BRICK_Y + row*(C.BRICK_H+C.BRICK_GAP), w:width, h:C.BRICK_H,
        row, color:COLORS.rows[Math.min(row,4)], points:C.POINTS[Math.min(row,4)], alive:true });
    }));
  }
  function resetBall() {
    ball.x = paddle.x + paddle.w/2; ball.y = paddle.y - ball.r - 2;
    ball.speed = Math.min(C.BALL_SPEED + (level-1)*C.LEVEL_SPEED, C.BALL_MAX);
    const sign = Math.random() > .5 ? 1 : -1;
    ball.vx = sign * ball.speed * .55; ball.vy = -Math.sqrt(ball.speed**2 - ball.vx**2); ball.launched = false;
  }
  function updateHUD() {
    ui.score.textContent = String(score).padStart(6,"0"); ui.level.textContent = String(level).padStart(2,"0");
    ui.lives.textContent = lives > 0 ? Array(lives).fill("♥").join(" ") : "0";
  }
  function showOverlay(tag,title,message,button) {
    ui.tag.textContent=tag; ui.title.textContent=title; ui.message.textContent=message; ui.button.textContent=button; ui.overlay.classList.remove("hidden");
  }
  function hideOverlay(){ ui.overlay.classList.add("hidden"); }
  function announce(text){ ui.announcement.textContent=text; ui.announcement.classList.remove("show"); void ui.announcement.offsetWidth; ui.announcement.classList.add("show"); announcementTimer=1.25; }
  function startGame(){ score=0;lives=C.LIVES;level=1;particles=[];paddle.w=C.PADDLE_W;paddle.x=(C.W-paddle.w)/2;buildBricks();resetBall();setState(STATE.READY);updateHUD();showOverlay("PREPARE-SE","NÍVEL 01","Pressione espaço, clique ou toque para lançar.","LANÇAR BOLA");canvas.focus(); }
  function launchBall(){ if(state===STATE.MENU){startGame();return;} if(state===STATE.READY){ball.launched=true;setState(STATE.PLAYING);hideOverlay();} }
  function togglePause(){ if(state===STATE.PLAYING){previousState=state;setState(STATE.PAUSED);showOverlay("PAUSADO","JOGO PAUSADO","A física está interrompida. Pressione P, Esc ou continue.","CONTINUAR");} else if(state===STATE.PAUSED){setState(previousState===STATE.READY?STATE.READY:STATE.PLAYING);hideOverlay();} }
  function clampPaddle(){ paddle.x=Math.max(0,Math.min(C.W-paddle.w,paddle.x)); }
  function movePaddleTo(clientX){ const rect=canvas.getBoundingClientRect(); paddle.x=(clientX-rect.left)*(C.W/rect.width)-paddle.w/2;clampPaddle(); }

  function createParticles(x,y,color){ for(let i=0;i<7;i++){const a=Math.random()*Math.PI*2,s=35+Math.random()*100;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35,maxLife:.35,color});} }
  function updateParticles(dt){ for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt;} particles=particles.filter(p=>p.life>0); }
  function circleRect(circle,rect){ const x=Math.max(rect.x,Math.min(circle.x,rect.x+rect.w)), y=Math.max(rect.y,Math.min(circle.y,rect.y+rect.h)); const dx=circle.x-x,dy=circle.y-y;return dx*dx+dy*dy<=circle.r*circle.r; }

  function walls(){ if(ball.x-ball.r<=0){ball.x=ball.r;ball.vx=Math.abs(ball.vx);} if(ball.x+ball.r>=C.W){ball.x=C.W-ball.r;ball.vx=-Math.abs(ball.vx);} if(ball.y-ball.r<=0){ball.y=ball.r;ball.vy=Math.abs(ball.vy);} }
  function paddleCollision(previousY){
    if(ball.vy<=0)return;
    const horizontal=ball.x+ball.r>=paddle.x&&ball.x-ball.r<=paddle.x+paddle.w;
    const crossed=previousY+ball.r<=paddle.y&&ball.y+ball.r>=paddle.y;
    if(!horizontal||!crossed)return;
    const hit=Math.max(-1,Math.min(1,(ball.x-(paddle.x+paddle.w/2))/(paddle.w/2)));
    const angle=hit*Math.PI*.38; ball.vx=ball.speed*Math.sin(angle);ball.vy=-ball.speed*Math.cos(angle);ball.y=paddle.y-ball.r-.1;paddleFlash=.12;
  }
  function brickCollision(previousX,previousY){
    for(const b of bricks){ if(!b.alive||!circleRect(ball,b))continue; b.alive=false;score+=b.points;scoreTimer=.16;createParticles(ball.x,ball.y,b.color);
      // o jogador arrisca a bola no topo porque a recompensa por destruir os tijolos superiores é maior, incentivando trajetórias arriscadas em troca de mais pontos.
      const top=previousY+ball.r<=b.y,bottom=previousY-ball.r>=b.y+b.h,left=previousX+ball.r<=b.x,right=previousX-ball.r>=b.x+b.w;
      if(top){ball.y=b.y-ball.r;ball.vy=-Math.abs(ball.vy);} else if(bottom){ball.y=b.y+b.h+ball.r;ball.vy=Math.abs(ball.vy);} else if(left){ball.x=b.x-ball.r;ball.vx=-Math.abs(ball.vx);} else if(right){ball.x=b.x+b.w+ball.r;ball.vx=Math.abs(ball.vx);} else { const overlapX=Math.min(ball.x+ball.r-(b.x),b.x+b.w-(ball.x-ball.r)); const overlapY=Math.min(ball.y+ball.r-b.y,b.y+b.h-(ball.y-ball.r)); if(overlapX<overlapY)ball.vx*=-1;else ball.vy*=-1; }
      updateHUD();break;
    }
  }
  function loseLife(){ lives--;updateHUD(); if(lives<=0){lives=0;ball.launched=false;setState(STATE.GAMEOVER);updateHUD();showOverlay("FIM DE JOGO","GAME OVER",`Pontuação final: ${score} pontos.`,"JOGAR NOVAMENTE");return;} resetBall();setState(STATE.READY);showOverlay("VIDA PERDIDA","TENTE NOVAMENTE",`${lives} vida${lives===1?"":"s"} restante${lives===1?"":"s"}. A pontuação foi preservada.`,"LANÇAR BOLA"); }
  function finishLevel(){
    if(level>=C.MAX_LEVEL){ball.launched=false;setState(STATE.VICTORY);showOverlay("MISSÃO CONCLUÍDA","VITÓRIA!",`Você venceu os ${C.MAX_LEVEL} níveis com ${score} pontos.`,"JOGAR NOVAMENTE");return;}
    level++;paddle.w=Math.max(C.PADDLE_MIN,C.PADDLE_W-(level-1)*8);clampPaddle();buildBricks();resetBall();setState(STATE.READY);updateHUD();announce(`NÍVEL ${level}`);showOverlay("NÍVEL CONCLUÍDO",`NÍVEL ${String(level).padStart(2,"0")}`,"A raquete encolheu e a bola ficou mais rápida. Pontuação e vidas preservadas.","COMEÇAR NÍVEL");
  }
  function updatePaddle(dt){ if(keys.arrowleft||keys.a)paddle.x-=paddle.speed*dt;if(keys.arrowright||keys.d)paddle.x+=paddle.speed*dt;clampPaddle(); }
  function update(dt){
    if(state!==STATE.PAUSED){updateParticles(dt); if(scoreTimer>0){scoreTimer-=dt;ui.score.classList.add("bump");}else ui.score.classList.remove("bump"); paddleFlash=Math.max(0,paddleFlash-dt); announcementTimer=Math.max(0,announcementTimer-dt);}
    if(state===STATE.MENU||state===STATE.PAUSED||state===STATE.GAMEOVER||state===STATE.VICTORY)return;
    updatePaddle(dt); if(!ball.launched){ball.x=paddle.x+paddle.w/2;ball.y=paddle.y-ball.r-2;return;}
    const distance=ball.speed*dt, steps=Math.max(1,Math.ceil(distance/(ball.r*.75))), stepDt=dt/steps;
    for(let i=0;i<steps&&state===STATE.PLAYING;i++){const px=ball.x,py=ball.y;ball.x+=ball.vx*stepDt;ball.y+=ball.vy*stepDt;walls();paddleCollision(py);brickCollision(px,py);if(ball.y-ball.r>C.H){loseLife();return;}if(!bricks.some(b=>b.alive)){finishLevel();return;}}
  }
  function roundedRect(x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  function draw(){ctx.fillStyle=COLORS.bg;ctx.fillRect(0,0,C.W,C.H);for(const b of bricks){if(!b.alive)continue;ctx.fillStyle=b.color;roundedRect(b.x,b.y,b.w,b.h,3);ctx.fillStyle="rgba(255,255,255,.22)";ctx.fillRect(b.x+3,b.y+2,b.w-6,2);} for(const p of particles){ctx.globalAlpha=Math.max(0,p.life/p.maxLife);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,3,3);}ctx.globalAlpha=1;ctx.fillStyle=paddleFlash>0?"#FFF3BF":COLORS.paddle;roundedRect(paddle.x,paddle.y,paddle.w,paddle.h,4);ctx.beginPath();ctx.fillStyle=COLORS.ball;ctx.shadowColor="#fff";ctx.shadowBlur=8;ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;}
  function loop(t){if(!lastTime)lastTime=t;const dt=Math.min(C.DT_MAX,(t-lastTime)/1000);lastTime=t;update(dt);draw();requestAnimationFrame(loop);}

  window.addEventListener("keydown",e=>{const k=e.key.toLowerCase();keys[k]=true;if(["Space","ArrowLeft","ArrowRight"].includes(e.code))e.preventDefault();if(e.repeat&&(e.code==="Space"||k==="p"||k==="escape"||k==="r"))return;if(e.code==="Space")launchBall();else if(k==="r")startGame();else if((k==="p"||k==="escape")&&(state===STATE.PLAYING||state===STATE.PAUSED))togglePause();},{passive:false});
  window.addEventListener("keyup",e=>{keys[e.key.toLowerCase()]=false;});window.addEventListener("blur",()=>{Object.keys(keys).forEach(k=>keys[k]=false);if(state===STATE.PLAYING)togglePause();});
  canvas.addEventListener("pointermove",e=>{movePaddleTo(e.clientX);});
  canvas.addEventListener("pointerdown",e=>{e.preventDefault();canvas.setPointerCapture?.(e.pointerId);movePaddleTo(e.clientX);if(state===STATE.READY)launchBall();},{passive:false});
  ui.button.addEventListener("click",()=>{if(state===STATE.PAUSED)togglePause();else if(state===STATE.MENU||state===STATE.GAMEOVER||state===STATE.VICTORY)startGame();else if(state===STATE.READY)launchBall();});

  buildBricks();resetBall();updateHUD();showOverlay("READY PLAYER","BREAKOUT BITS",`Destrua as formações autorais e vença ${C.MAX_LEVEL} níveis.`,"INICIAR JOGO");requestAnimationFrame(loop);
})();
