if(main_ret==179||main_ret==0){
localStorage.passcountSL=++localStorage.passcountSL;passCounterSL.innerHTML=localStorage.passcountSL;
if (sessionStorage.justExp != null){msgs.innerHTML="Exploit Loaded ✔ Now Load HEN";justExp.style="display:none";henSection.style="display:block";}
else {setTimeout(load_autoHEN,500);}
}
else{localStorage.failcountSL=++localStorage.failcountSL;msgs.innerHTML="Jailbreak failed! - Reboot your PS4 and try again.";opt1.style="display:none";failCounterSL.innerHTML=localStorage.failcountSL;alert("Jailbreak failed!\n Reboot your PS4 and try again.");}}