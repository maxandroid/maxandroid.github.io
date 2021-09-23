var PS4RTE = function (ip) {
    this.base = "http://" + ip + ":771/";

	this.setIPaddr = function(ipAddr) {
		this.base = "http://" + ipAddr + ":771/";
	}

    this.GetProcessList = function (callback, failure) {
        return $.get(this.base + "list", callback).fail(failure);
    };

    this.GetProcessInfo = function (pid, callback, failure) {
        return $.get(this.base + "info?pid=" + pid, callback).fail(failure);
    };

    this.GetProcessMaps = function (pid, callback, failure) {
        return $.get(this.base + "mapping?pid=" + pid, callback).fail(failure);
    };

    this.ReadMemory = function (pid, address, length, callback, failure) {
        return $.get(
            this.base +
            "read?pid=" +
            pid +
            "&address=" +
            address +
            "&length=" +
            length,
            callback
            ).fail(failure);
    };

    this.WriteMemory = function (
        pid,
        address,
        data,
        length,
        callback,
        failure
        ) {
        return $.get(
            this.base +
            "write?pid=" +
            pid +
            "&address=" +
            address +
            "&data=" +
            data +
            "&length=" +
            length,
            callback
            ).fail(failure);
    };

    this.AllocateMemory = function (pid, length, callback, failure) {
        return $.get(
            this.base + "alloc?pid=" + pid + "&length=" + length,
            callback
            ).fail(failure);
    };

    this.FreeMemory = function (pid, address, length, callback, failure) {
        return $.get(
            this.base +
            "free?pid=" +
            pid +
            "&address=" +
            address +
            "&length=" +
            length,
            callback
            ).fail(failure);
    };

    this.PauseProcess = function (pid, callback, failure) {
        return $.get(this.base + "pause?pid=" + pid, callback).fail(failure);
    };

    this.ResumeProcess = function (pid, callback, failure) {
        return $.get(this.base + "resume?pid=" + pid, callback).fail(failure);
    };

    this.Notify = function (messageType, message, callback, failure) {
        return $.get(
            this.base +
            "notify?messageType=" +
            messageType +
            "&message=" +
            btoa(message + "\x00"),
            callback
            ).fail(failure);
    };
};

var ProcessList = null;
var ProcessInfo = null;
var ProcessMaps = null;
var SelectedProcess = null;
var PS4 = null;

function FailCallback() {
    if (typeof ProcessList.reject == "function") {
        ProcessList.reject();
    }
    ProcessInfo.reject();
    ProcessMaps.reject();
}

function GetProcessListCallback(data) {
    ProcessList.resolve(data);
}

function GetProcessInfoCallback(data) {
    ProcessInfo.resolve(data);
}

function GetProcessMapsCallback(data) {
    ProcessMaps.resolve(data);
}

function HexStringToBase64(str) {
    var result = [];
    while (str.length >= 2) {
        result.push(parseInt(str.substring(0, 2), 16));
        str = str.substring(2);
    }
    return btoa(String.fromCharCode.apply(null, new Uint8Array(result)));
}

function zeroFill(number, width, swap) {
    width -= number.toString().length;

    if (width > 0) {
        return (
            new Array(width + (/\./.test(number) ? 2 : 1)).join("0") + number
            );
    }
    if (swap) {
        number = number.match(/.{2}/g);
        number = number.reverse().join("");
    }
    return number + ""; // always return a string
}

function GetNthEntry(n) {
    if (ProcessMaps != null) {
        return ProcessMaps[n].start;
    }
    return null;
}

function FindBase() {
    var base = null;
    ProcessMaps.some(function (entry) {
        if (entry.name === "executable" && entry.prot === 5) {
            base = entry;
            return true;
        }
        return false;
    });
    if (base != null) {
        return base.start;
    }
    return null;
}

function FindProcess(name) {
    var proc = null;
    ProcessList.some(function (process) {
        if (process.name === name) {
            proc = process;
            return true;
        }
        return false;
    });
    return proc;
}

function FillDialog(cheat, index) {
    var name = cheat.name;
    var content;
    switch (cheat.type) {
        case "checkbox":
        content = $(
            `<div class="ps_checkbox_wrapper">
            <label class="switch" for="_${index}">
            <input id="_${index}" type="checkbox" />
            <div class="ps_slider round"></div>
            </label>
            <span>${name}</span>
            </div>`
            );
        break;
        case "button":
        content = $(
            `<div style="margin-bottom: 10px;">
            <label class="switch">
            <button class="btn btn-primary" id="${index}" type="button">${name}</button>
            </label>
            </div>`
            );
        break;
    }
    $("#mods").append(content);
}

function WriteMemory(memory, activated) {
    var base = null;
    if (memory.section === undefined || memory.section === 0) {
        base = bigInt(FindBase());
    } else {
        base = bigInt(GetNthEntry(memory.section));
    }
    var offset = bigInt(memory.offset, 16);
    var address = base.add(offset);
    var hex;
    if (activated) {
        hex = memory.on;
    } else {
        hex = memory.off;
    }
    var data = HexStringToBase64(hex);
    var length = hex.length / 2;
    PS4.WriteMemory(SelectedProcess.pid, address.toString(10), data, length);
}

function HandleMasterCode(master, cheats) {
    PS4.AllocateMemory(SelectedProcess.pid, 0x1, function (data) {
        if (master.challenged === undefined || master.challenged !== "yes") {
            var address = bigInt(data.address).plus(8).toString(16);
            address = zeroFill(address, 16, true);
            cheats.forEach(function (cheat) {
                cheat.memory.forEach(function (mem) {
                    mem.on = mem.on.replace("{ALLOC}", address);
                });
            });
            master.memory.forEach(function (element) {
                element.on = element.on.replace("{ALLOC}", address);
            });
        }
        master.memory.forEach(function (element) {
            WriteMemory(element, true);
        });
    });
    //Optimizations? -> Check if memory was already allocated b4 doing this shit
}

function HookMod(mod, index) {
    var name = mod.name;
    var memory = mod.memory;

    switch (mod.type) {
        case "checkbox":
        $("#_" + index).change(function () {
            var activated = this.checked;
            PS4.PauseProcess(SelectedProcess.pid, null, function () {
                if (memory.length !== undefined) {
                    memory.forEach(function (element, index) {
                        WriteMemory(element, activated);
                    });
                    PS4.ResumeProcess(SelectedProcess.pid);
                    if (activated) {
                        PS4.Notify(222, name + " |Enabled ");
                    } else {
                        PS4.Notify(222, name + " |Disabled ");
                    }
                }
            });
        });
        break;
        case "button":
        $("#" + index).click(function () {
            PS4.PauseProcess(SelectedProcess.pid, null, function () {
                if (memory.length !== undefined) {
                    memory.forEach(function (element, index) {
                        WriteMemory(element, true);
                    });

                    PS4.ResumeProcess(SelectedProcess.pid);
                    PS4.Notify(222, name + " |Enabled ");
                }
            });
        });
        break;
    }
}

function HandleTrainer(mods) {
    var good = true;
    if (
        SelectedProcess == null ||
        typeof ProcessMaps.state == "function" ||
        typeof ProcessInfo.state == "function"
        ) {
        $("#Message").text("Trainer Failed To Attach.");
    good = false;
}
if (mods.length !== undefined) {
    mods.forEach(function (mod, index) {
        FillDialog(mod, index);
        if (good) {
            HookMod(mod, index);
        }
    });
}
if (good) {
    $("#Message").text("Trainer Attached");
    PS4.Notify(222, "Trainer Attached");
}

    // $.LoadingOverlay("hide");
    let modal = window.modalInstances.find((e) => e.id === "trainer-dialog");
    modal.open();
}

function CreateCard(i, trainer) {


    let cardTemplate = `
    <div 
    class="col col s12 m6 x4 xl5ths trainer-card animate__animated animate__zoomIn" 
    source="${trainer.url}"
    ${`style="animation-delay: ${i / 20}s;"`}
    >
    <div class="trainer-card-content waves-effect waves-dark">
    <div>
    <img class="ps_thumb" loading="lazy" onerror="if (this.src !== 'img/error.png') this.src = 'img/error.png';" data-src="img/${trainer.title
    }.jpg" src="img/${trainer.title}.jpg" />
    <div class="row game-info text-white">
    <p class="game-name" title="${trainer.name}"> ${trainer.name.trim()
    }</p>
    <p class="cusa">${trainer.title}</p>
    <p class="version"><span> v${trainer.version} </span></p>
    </div>
    </div>
    </div>`;

    return $(cardTemplate);
}
// var observer;
$(document).ready(function () {
    var listUrl = "http://karo218.ir/TRAINER/list.json";

    $.LoadingOverlay("show", {
        image: "img/main_loader.gif",
        imageAnimation: "0.8s fadein",
    });

    $(".login").click(LoginDialogCallBack);
    $(".signup").click(SignUpDialogCallBack);
    $("#forgot").click(ForgotDialogCallBack);
    $(".favList").click(FavlistDialogCallBack);
    $("#loginForm").submit(function (e) {
        e.preventDefault();
    });
    $("#trainer-fav").click(AddOrDeleteWishList);
    var user = localStorage.getItem("user");
    if (user != null && user != undefined)
        GetWishList();
    hideShowBtn();
    $.get(listUrl, ListCallback).then(function () {
        $("#search-input").on("keyup", SearchCallback);
        $(".trainer-card").click(TrainerClickCallback);
        /* observer = new LazyLoad({
            elements_selector: ".lazy",
            to_webp: true,
        }); */
    });
    $("#ip").val(localStorage.getItem("ip"));
});
function ListCallback(data) {
    data.games.sort(function (a, b) {
        var item1 = a.name.toUpperCase();
        var item2 = b.name.toUpperCase();
        if (item1 < item2) {
            return -1;
        }
        if (item1 > item2) {
            return 1;
        }
        return 0;
    });
    localStorage.setItem("gameList", JSON.stringify(data.games));
    var l=data.games.length;
    var list_container=$("#list_container")
    for(var i=0;i<l;i++){
        var card = CreateCard(i, data.games[i]);
        list_container.append(card);
    };
    $.LoadingOverlay("hide");
}

// $(window).scroll(function () {
//  var scrollHeight = $(document).height();
//  var scrollPosition = $(window).height() + $(window).scrollTop();
//  if (scrollPosition >= scrollHeight-1000) {
//     let list = JSON.parse(localStorage.getItem("gameList"));
//     list = list.slice(document.getElementById("list_container").childElementCount);
//     $.each(list, function (i, trainer) {
//         if (i < 20) {
//             var card = CreateCard(i, trainer);
//             $("#list_container").append(card);
//         }
//     });
// }
// $(".trainer-card").unbind();
// $(".trainer-card").click(TrainerClickCallback);
// });

function FavListCallback(data) {
    $("#favlist_container").empty();
    var list = JSON.parse(localStorage.getItem("listing"));
    var isFav = false;
    if(list.length<=0){
        $("#favlist_container").innerHTML="<h1>No Favorites<h1>"
    }else{
        var favlist_container= $("#favlist_container");
        for(var i=0;i<list.length;i++) {
            for(var j=0;j<data.games.length;j++) {
                console.log("#################",list[i].product_id , data.games[j].title);
                if (list[i].product_id === data.games[j].title && list[i].version===data.games[j].version) {
                    var card = CreateCard(i, data.games[j]);
                    favlist_container.append(card);
                    break;
                }
            };
            
            // console.log(favlist_container,isFav);
            

        }
    }
}

function SearchCallback() {
    let input = $("#search-input").val().toLowerCase();
    $(".trainer-card").each(function () {
        let source = $(this).find(".game-name").eq(0).html().toLowerCase();
		let sourceCusa = $(this).find(".cusa").eq(0).html().toLowerCase();
        $(this).removeClass("d-flex");
        $(this).removeClass("d-flex");

        if (source.indexOf(input) > -1 || sourceCusa.indexOf(input) > -1) {
            $(this).addClass("d-flex");
            $(this).show();
        } else {
            $(this).hide();
        }
    });
    // observer.update();
}
function LoginDialogCallBack() {
    let modal = window.modalInstances.find((e) => e.id === "login-dialog");
    modal.open();
}

function FavlistDialogCallBack() {
    var listUrl = "./list.json";
    let modal = window.modalInstances.find((e) => e.id === "fav-dialog");
    modal.open();
    $.get(listUrl, FavListCallback).then(function () {
        $(".trainer-card").click(TrainerClickCallback);
        /* observer = new LazyLoad({
            elements_selector: ".lazy",
            to_webp: true,
        }); */
    });
}

function ForgotDialogCallBack() {
    let modal = window.modalInstances.find((e) => e.id === "login-dialog");
    modal.close();
    modal = window.modalInstances.find((e) => e.id === "forgot-dialog");
    modal.open();
}

function SignUpDialogCallBack() {
    let modal = window.modalInstances.find((e) => e.id === "signup-dialog");
    modal.open();

}

function DontHaveAccount() {
    let modal = window.modalInstances.find((e) => e.id === "login-dialog");
    modal.close();
    modal = window.modalInstances.find((e) => e.id === "signup-dialog");
    modal.open();

}
function AlreadyHaveAccount() {
    let modal = window.modalInstances.find((e) => e.id === "signup-dialog");
    modal.close();
    modal = window.modalInstances.find((e) => e.id === "login-dialog");
    modal.open();


}



var gcard = null;
var timer = null;


function tCheckCard()
{
	if (gcard) {
		// you click you blow up -js at it's finest
		ProcessList		= null;
		ProcessInfo		= null;
		ProcessMaps		= null;
	
		gcard.click();
		return;
	}
}


function AutoSelectCard(partial)
{
	gcard = null;
    $(ProcessList).each(function(ix,process)	//some(function(process)
    {				
		var defer = PS4.GetProcessInfo(process.pid, GetProcessInfoCallback, FailCallback),
			filtered = defer.then(function (pi) 
		
		{
			var tid = pi.titleid.trim();
			
			if(tid.startsWith(partial))
			{
				$("#list_container .trainer-card").each(function(ix, card) {
					if ($(card).find(".cusa").text() === pi.titleid) {
						gcard = card;
						return false;
					}
				});
			}
			if (timer) {
				clearTimeout(timer);
			}
			timer = setTimeout(tCheckCard, 100);

		});
    });
	return gcard;
}


function autoSelGame()
{
	PS4 = new PS4RTE($("#ip").val());
	
    ProcessList		= $.Deferred();
    ProcessInfo		= $.Deferred();
    ProcessMaps		= $.Deferred();
    SelectedProcess	= null;

	
	PS4.GetProcessList(GetProcessListCallback, FailCallback);
	$.when(ProcessList).done(function (pl)
	{
		localStorage.setItem('ip', $("#ip").val());
		ProcessList = pl;
		
		AutoSelectCard("CUSA");
	});
		
}

function TrainerClickCallback()
{

	PS4 = new PS4RTE($("#ip").val());
		
	ProcessList = $.Deferred();
	ProcessInfo = $.Deferred();
	ProcessMaps = $.Deferred();
    SelectedProcess	= null;
	
	
    var cusa = $(this).find(".cusa").text();
    var status = false;
    $("#cover").attr("data-src", "img/" + cusa + ".jpg");
    $("#cover").attr("src", "img/" + cusa + ".jpg");
    // observer.load($("#cover").get(0), true);
    /* $.LoadingOverlay("show", {
        image: "img/main_loader.gif",
        imageAnimation: "0.8s fadein",
    }); */

    var trainerUrl = $(this).attr("source");
    $.get(trainerUrl, function (data) {
        var mods = data.mods;
        $("#game").attr("process", data.process).text(data.name);
        $("#cusa").text(data.id);
        $("#version").text("v" + data.version);
        $("#credits").text(data.credits);
        $("#mods").empty();
        document.getElementById("jsonData").textContent = JSON.stringify(data, undefined, 2);
        document.getElementById("jsonData").style.display = "none";
        localStorage.setItem("gameid", data.id);
        localStorage.setItem("gameversion", data.version);
        var listing = JSON.parse(localStorage.getItem("listing"));
        if (listing !== null && listing !== undefined) {
            listing.every(function (e) {
                if (e.product_id === data.id && e.version===data.version) {
                    localStorage.setItem("status", true);
                    return false;
                }
                else {
                    localStorage.setItem("status", false);
                    return true;
                }
            })
        }
        
        if(listing!=null && listing!=undefined && listing.length<=0){
         localStorage.setItem("status", false);
     }
     var status = JSON.parse(localStorage.getItem("status"));
     if (status) {
        document.getElementById('trainer-fav').classList.remove('far');
        document.getElementById('trainer-fav').classList.add('fas');
    } else {
        document.getElementById('trainer-fav').classList.remove('fas');
        document.getElementById('trainer-fav').classList.add('far');
    }

    PS4.GetProcessList(GetProcessListCallback, FailCallback);
    $.when(ProcessList)
    .done(function (v1) {
        localStorage.setItem("ip", $("#ip").val());
        ProcessList = v1;
        SelectedProcess = FindProcess((data).process);
        PS4.GetProcessMaps(
            SelectedProcess.pid,
            GetProcessMapsCallback,
            FailCallback
            );
        PS4.GetProcessInfo(
            SelectedProcess.pid,
            GetProcessInfoCallback,
            FailCallback
            );
        $.when(ProcessMaps, ProcessInfo)
        .done(function (v2, v3) {
            ProcessMaps = v2;
            ProcessInfo = v3;
            var master = (data).master;
            if (
                master !== undefined &&
                master.memory.length !== undefined &&
                v1 != null
                ) {
                HandleMasterCode(master, mods);
        }
    })
        .always(function () {
            HandleTrainer(mods);
        });
    })
    .fail(function () {
        HandleTrainer(mods);
    });
});




    // function FAVORITECLICKCALLBACK(data) {
    //     let favList = localStorage.getItem("favList");
    //     if(favList===null || favList===undefined){
    //         favList=[];
    //     }
    //         favList.map((e) => {
    //             if (e === JSON.parse(data).data) {
    //                 let index = favList.indexOf(e);
    //                 if (index > -1) {
    //                     favList.splice(index, 1);
    //                 }
    //             }
    //         });
    //     localStorage.setItem("favList", favList);

    // }
}




function Login(e) {
    let username = document.getElementById("login-username").getElementsByTagName("input")[0].value;
    let password = document.getElementById("login-password").getElementsByTagName("input")[0].value;
    LoginCallBack(username,password);
    e.preventDefault();
}

function LoginCallBack(username,password){
    let obj = {
        tag: "login",
        username: username,
        password: password
    }
    $.ajax({ url: "./api/user.php", data: obj, type: 'POST' }
        ).done(function (data, status) {
            console.log(data, JSON.parse(data));
            M.toast({ html: JSON.parse(data).msg });
            if (JSON.parse(data).status == "Success") {
                localStorage.setItem("user", JSON.stringify(JSON.parse(data).user_detail));
                hideShowBtn();
                GetWishList();
                document.getElementById("loginForm").reset();
                let modal = window.modalInstances.find((e) => e.id === "login-dialog");
                modal.close();
            }
            return false;
        });
    }

    function SignUp(e) {
        // let name = document.getElementById("signup-name").getElementsByTagName("input")[0].value;
        let username = document.getElementById("signup-username").getElementsByTagName("input")[0].value;
        let email = document.getElementById("signup-email").getElementsByTagName("input")[0].value;
        let password = document.getElementById("signup-password").getElementsByTagName("input")[0].value;
        let cnfpassword = document.getElementById("signup-cnfpassword").getElementsByTagName("input")[0].value;
        let obj = {
            tag: "registration",
            username:username,
            name: name,
            email: email,
            password: password,
            cpassword: cnfpassword
        }
        $.ajax({ url: "./api/user.php", data: obj, type: 'POST' }
            ).done(function (data, status) {
                M.toast({ html: JSON.parse(data).msg });
                if (JSON.parse(data).status == "success") {
                    let modal = window.modalInstances.find((e) => e.id === "signup-dialog");
                    modal.close();
                    document.getElementById("signupForm").reset();
                    LoginCallBack(username,password);
                    
                }
                return false;
            });

            e.preventDefault();
        }

        function toggleData() {
            var x = document.getElementById("jsonData");
            if (x.style.display === "none") {
                x.style.display = "block";
            } else {
                x.style.display = "none";
            }
        }

        function hideShowBtn() {
            if (localStorage.getItem("user") === null || localStorage.getItem("user") === undefined) {
                document.getElementById("user-buttons").innerHTML = `
                <li class="ps_ml_5">
                <button class="btn login waves-effect waves-light">
                <span>Login</span>
                </button>
                </li>
                <li class="ps_ml_5">
                <button class="waves-effect signup waves-light btn">
                <span>SignUp</span>
                </button>
                </li>
                `;
                document.getElementById('myBtn').style.display='none';
                document.getElementById("mobile-nav").innerHTML = `
                <li class="login btn mobile_li" >Login</li>
                <li class="signup btn mobile_li">SignUp</li>
                `;
                $(".login").click(LoginDialogCallBack);
                $(".signup").click(SignUpDialogCallBack);
                $("#loginForm").submit(function (e) {
                    e.preventDefault();
                });

            } else {

                // <li class="ps_ml_5">
                // <button class="btn favList waves-effect waves-light">
                // <span>Favorites</span>
                // </button>
                // </li>
                document.getElementById("user-buttons").innerHTML = `
                <li class="ps_ml_10">
                <button class="btn logout waves-effect waves-light">
                <span>Logout</span>
                </button>
                </li>
                `;
                document.getElementById('myBtn').style.display='block';
                document.getElementById("mobile-nav").innerHTML = `
                <li class="logout btn mobile_li" >Logout</li>
                `;
                $("#myBtn").click(FavlistDialogCallBack);
                $(".logout").click(LogoutDialogCallBack);
            }
        }

        function LogoutDialogCallBack() {
            localStorage.clear();
            hideShowBtn();
        }

        async function AddOrDeleteWishList() {
            let gameid = localStorage.getItem("gameid");
            let gameversion = localStorage.getItem("gameversion");
            let status = localStorage.getItem("status") === null ? false : localStorage.getItem("status");
            let user = JSON.parse(localStorage.getItem("user"));
            if (user != null && user != undefined) {
                let obj = {
                    user_id: user.id,
                    product_id: gameid,
                    version:gameversion,
                    status: status,
                    tag: "add_delete"
                }
                await $.ajax({ url: "./api/wishlist.php", data: obj, type: 'POST' }
                    ).done(async function (data, status) {
                        M.toast({ html: JSON.parse(data).msg });
                        if (JSON.parse(data).status == "success") {
                            await GetWishList();
                            var listing = JSON.parse(localStorage.getItem("listing"));
                            listing.every(function (e,i) {
                                if (e.product_id === gameid && e.version===gameversion) {
                                    listing.slice(i,1);
                                    localStorage.setItem("status", true);
                                    return false;
                                }
                                else {
                                    localStorage.setItem("status", false);
                                    return true;
                                }
                            })
                            if(listing!=null && listing!=undefined && listing.length<=0){
                                localStorage.setItem("status", false);
                            }
                            var status = JSON.parse(localStorage.getItem("status"));
                            if (status) {
                                document.getElementById('trainer-fav').classList.remove('far');
                                document.getElementById('trainer-fav').classList.add('fas');
                            } else {
                                document.getElementById('trainer-fav').classList.remove('fas');
                                document.getElementById('trainer-fav').classList.add('far');
                            }
                        }
                        return false;
                    });
                } else {
                    let modal = window.modalInstances.find((e) => e.id === "login-dialog");
                    modal.open();
                    $('#loginForm').trigger('reset')
                }
            }

            async function GetWishList() {
                let user = JSON.parse(localStorage.getItem("user"));
                let obj = {
                    user_id: user.id,
                    tag: "listing"
                }
                let result;

                try {
                    result = await $.ajax({ url: "./api/wishlist.php", data: obj, type: 'POST' });
                    if (JSON.parse(result).status == "Success") {
                        localStorage.setItem("listing", JSON.stringify(JSON.parse(result).listing));
                    }else if(JSON.parse(result).status == "Fail"){
                        localStorage.setItem("listing", JSON.stringify([]));
                    }
                    return false;
                } catch (error) {
                    console.error(error);
                }
            }