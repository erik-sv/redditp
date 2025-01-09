/*
  You can save the HTML file and use it locally btw like so:
    file:///wherever/index.html?/r/aww

  Check out the source at:
  https://github.com/ubershmekel/redditp
*/

// TODO: refactor all the globals to use the rp object's namespace.
var rp = {};
var galleryOffset = 0
rp.settings = {
    debug: true,
    // Speed of the animation
    animationSpeed: 100,
    shouldAutoNextSlide: true,
    timeToNextSlide: 15 * 1000,
    cookieDays: 300,
    nsfw: true,
    sound: false
};

rp.session = {
    // 0-based index to set which picture to show first
    // init to -1 until the first image is loaded
    activeIndex: -1,

    // Variable to store if the animation is playing or not
    isAnimating: false,

    // Id of timer
    nextSlideTimeoutId: null,

    // Reddit filter "After"
    after: "",

    foundOneImage: false,

    loadingNextImages: false
};

// Variable to store the images we need to set as background
// which also includes some text and url's.
rp.photos = [];

// Store blocked users and API base URL
rp.blockedUsers = new Set();
rp.apiBaseUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3600'  // Local development
    : '';  // Production (relative path)

rp.nextSlide = function(skipCount) {
    var next = rp.getNextSlideIndex(rp.session.activeIndex, skipCount);
    rp.saveHistory(next);
    rp.startAnimation(next);
};

rp.loadBlockedUsers = async function() {
    try {
        const response = await fetch(`${rp.apiBaseUrl}/api/blocked-users`);
        if (response.ok) {
            const data = await response.json();
            console.log('Loaded blocked users:', data.blockedUsers);
            rp.blockedUsers = new Set(data.blockedUsers);
            
            // Filter out posts from blocked users
            if (rp.photos && rp.photos.length > 0) {
                const oldLength = rp.photos.length;
                rp.photos = rp.photos.filter(photo => {
                    const username = photo.userLink || photo.data?.author;
                    return !rp.blockedUsers.has(username);
                });
                console.log(`Filtered out ${oldLength - rp.photos.length} blocked posts`);
                
                // Update navigation buttons
                $('#navboxContent').empty();
                if (rp.photos.length > 0) {
                    for (var i = 0; i < rp.photos.length; i++) {
                        const numberButton = $("<span />").addClass("numberButton").text(i + 1);
                        rp.addNumberButton(numberButton);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error loading blocked users:', error);
        rp.blockedUsers = new Set();
    }
};

rp.hideCurrentUser = async function() {
    console.log('hideCurrentUser called');
    const currentPhoto = rp.photos[rp.session.activeIndex];
    console.log('Current photo:', currentPhoto);
    
    const username = currentPhoto?.userLink || currentPhoto?.data?.author;
    console.log('Username to block:', username);
    
    if (currentPhoto && username) {
        try {
            console.log('Blocking user:', username);
            const response = await fetch(`${rp.apiBaseUrl}/api/blocked-users`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ username: username })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            console.log('Server response:', data);
            rp.blockedUsers = new Set(data.blockedUsers);
            
            // Filter out the blocked user's photos
            const oldLength = rp.photos.length;
            rp.photos = rp.photos.filter(photo => {
                const photoUsername = photo.userLink || photo.data?.author;
                return !rp.blockedUsers.has(photoUsername);
            });
            console.log(`Filtered out ${oldLength - rp.photos.length} photos`);
            
            if (rp.blockedUsers.has(username)) {
                console.log('Moving to next slide');
                rp.nextSlide();
            }
            
            // Update navigation buttons
            $('#navboxContent').empty();
            // Only add number buttons if there are photos left
            if (rp.photos.length > 0) {
                for (var i = 0; i < rp.photos.length; i++) {
                    const numberButton = $("<span />").addClass("numberButton").text(i + 1);
                    rp.addNumberButton(numberButton);
                }
            }
            
            toastr.success(`Blocked all posts from user: ${username}`);
        } catch (error) {
            console.error('Error blocking user:', error);
            toastr.error('Failed to block user');
        }
    } else {
        console.log('No current photo or username found');
        toastr.error('Could not determine current post author');
    }
};

// maybe checkout http://engineeredweb.com/blog/09/12/preloading-images-jquery-and-javascript/ for implementing the old precache
rp.cache = {};

// Error reporting function
rp.reportError = function(message) {
    console.error(message);
    toastr.error(message);
};

$(function () {
    console.log('Document ready, setting up click handlers');

    var pictureSliderId = "#pictureSlider";

    $("#subredditUrl").text("Loading Reddit Slideshow");
    $("#navboxTitle").text("Loading Reddit Slideshow");
    
    /*var fadeoutWhenIdle = true;
    var setupFadeoutOnIdle = function () {
        $('.fadeOnIdle').fadeTo('fast', 0);
        var navboxVisible = false;
        var fadeoutTimer = null;
        var fadeoutFunction = function () {
            navboxVisible = false;
            if (fadeoutWhenIdle) {
                $('.fadeOnIdle').fadeTo('slow', 0);
            }
        };
        $("body").mousemove(function () {
            if (navboxVisible) {
                clearTimeout(fadeoutTimer);
                fadeoutTimer = setTimeout(fadeoutFunction, 2000);
                return;
            }
            navboxVisible = true;
            $('.fadeOnIdle').fadeTo('fast', 1);
            fadeoutTimer = setTimeout(fadeoutFunction, 2000);
        });
    };*/
    // this fadeout was really inconvenient on mobile phones
    // and instead the minimize buttons should be used.
    //setupFadeoutOnIdle();

    rp.getNextSlideIndex = function (currentIndex, skipCount) {
        if(typeof skipCount !== "number"){
            var skipCount = 1
        }
        if (!rp.settings.nsfw) {
            // Skip any nsfw if you should
            for (var i = currentIndex + skipCount; i < rp.photos.length; i++) {
                if (!rp.photos[i].over18) {
                    return i;
                }
            }
            return 0;
        }
        if (rp.isLastImage(currentIndex) && !rp.session.loadingNextImages) {
            // The only reason we got here and there aren't more pictures yet
            // is because there are no more images to load, start over
            return 0;
        }
        // Just go to the next slide, this should be the common case
        return currentIndex + skipCount;
    };

    rp.prevSlide = function() {
        var index = rp.session.activeIndex - 1;
        if (!rp.settings.nsfw) {
            for (; index > 0; index--) {
                if (!rp.photos[index].over18) {
                    break;
                }
            }
            // index will be zero here if no sfw items found
        }

        rp.saveHistory(index);
        rp.startAnimation(index);
    }


    rp.autoNextSlide = function () {
        if (rp.settings.shouldAutoNextSlide) {
            // startAnimation takes care of the setTimeout  
            rp.nextSlide();
        }
    };

    rp.open_in_background = function(selector) {
        // as per https://developer.mozilla.org/en-US/docs/Web/API/event.initMouseEvent
        // works on latest chrome, safari and opera
        var link = $(selector)[0];

        // Simulating a ctrl key won't trigger a background tab on IE and Firefox ( https://bugzilla.mozilla.org/show_bug.cgi?id=812202 )
        // so we need to open a new window
        if (navigator.userAgent.match(/msie/i) || navigator.userAgent.match(/trident/i) || navigator.userAgent.match(/firefox/i)) {
            window.open(link.href, '_blank');
        } else {
            var mev = document.createEvent("MouseEvents");
            mev.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0, true, false, false, true, 0, null);
            link.dispatchEvent(mev);
        }
    }

    $("#pictureSlider").touchwipe({
        // wipeLeft means the user moved his finger from right to left.
        wipeLeft: rp.prevSlide,
        wipeRight: rp.nextSlide,
        wipeUp: rp.nextSlide,
        wipeDown: rp.prevSlide,
        min_move_x: 20,
        min_move_y: 20,
        preventDefaultEvents: false
    });

    var OPENSTATE_ATTR = "data-openstate";
    $('.collapser').click(function () {
        var state = $(this).attr(OPENSTATE_ATTR);
        if (state === "open") {
            // close it
            $(this).text("+");
            // move to the left just enough so the collapser arrow is visible
            var arrowLeftPoint = $(this).position().left;
            $(this).parent().animate({
                left: "-" + arrowLeftPoint + "px"
            });
            $(this).attr(OPENSTATE_ATTR, "closed");
        } else {
            // open it
            $(this).text("-");
            $(this).parent().animate({
                left: "0px"
            });
            $(this).attr(OPENSTATE_ATTR, "open");
        }
    });

    // Arguments are image paths relative to the current page.
    rp.preLoadImages = function () {
        var args_len = arguments.length;
        for (var i = args_len; i--;) {
            var cacheImage = document.createElement('img');
            cacheImage.src = arguments[i];
            // Chrome makes the web request without keeping a copy of the image.
            //rp.cache.push(cacheImage);
        }
    };

    var cookieNames = {
        nsfwCookie: "nsfwCookie",
        shouldAutoNextSlideCookie: "shouldAutoNextSlideCookie",
        timeToNextSlideCookie: "timeToNextSlideCookie",
        soundCookie: "soundCookie"
    };

    rp.setCookie = function (c_name, value) {
        Cookies.set(c_name, value, {
            expires: rp.settings.cookieDays,
            // All the cookie issues are from requests to reddit.com
            // So no need for this "Lax" here.
            // sameSite: "Lax",
        });
    };


    rp.getCookie = function (c_name) {
        // undefined in case nothing found
        return Cookies.get(c_name);
    };

    rp.updateSound = function () {
        rp.settings.sound = $('#sound').is(':checked');
        rp.setCookie(cookieNames.soundCookie, rp.settings.sound);
        var videoTags = document.getElementsByTagName('video');
        if (videoTags.length === 1) {
            videoTags[0].muted = !rp.settings.sound;
        }
        var audioTags = document.getElementsByTagName('audio');
        if (audioTags.length === 1) {
            audioTags[0].muted = !rp.settings.sound;
        } else {
            console.log(audioTags);
        }
    };

    rp.resetNextSlideTimer = function () {
        clearTimeout(rp.session.nextSlideTimeoutId);
        rp.session.nextSlideTimeoutId = setTimeout(rp.autoNextSlide, rp.settings.timeToNextSlide);
    };

    rp.updateAutoNext = function () {
        rp.settings.shouldAutoNextSlide = $("#autoNextSlide").is(':checked');
        rp.setCookie(cookieNames.shouldAutoNextSlideCookie, rp.settings.shouldAutoNextSlide);
        rp.resetNextSlideTimer();
    };

    rp.toggleSound = function () {
        $("#sound").each(function () {
            this.checked = !this.checked;
            console.log(this.checked);
            $(this).trigger('change');
        });
    };

    rp.toggleFullScreen = function () {
        var elem = document.getElementById('page');
        if (document.fullscreenElement || // alternative standard method
            document.mozFullScreenElement || document.webkitFullscreenElement || document.msFullscreenElement) { // current working methods
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        } else {
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            } else if (elem.mozRequestFullScreen) {
                elem.mozRequestFullScreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            }
        }
    };

    rp.updateNsfw = function () {
        rp.settings.nsfw = $("#nsfw").is(':checked');
        rp.setCookie(cookieNames.nsfwCookie, rp.settings.nsfw);
    };

    rp.initState = function () {
        console.log('Initializing state and setting up handlers');
        
        // Set up hide user button click handler
        $("#hideUserButton").click(function(e) {
            e.preventDefault();
            console.log('Hide user button clicked');
            rp.hideCurrentUser();
        });

        $('#nsfw').change(rp.updateNsfw);
        $('#sound').change(rp.updateSound);
        $('#autoNextSlide').change(rp.updateAutoNext);
        $('#timeToNextSlide').change(rp.updateAutoNext);
        $('#timeToNextSlide').keyup(rp.updateTimeToNextSlide);
        $('#prevButton').click(rp.prevSlide);
        $('#nextButton').click(rp.nextSlide);

        var nsfwByCookie = rp.getCookie(cookieNames.nsfwCookie);
        if (nsfwByCookie === undefined) {
            rp.settings.nsfw = true;
        } else {
            rp.settings.nsfw = (nsfwByCookie === "true");
            $("#nsfw").prop("checked", rp.settings.nsfw);
        }
        $('#nsfw').change(rp.updateNsfw);

        // Fix sound cookie
        var soundByCookie = rp.getCookie(cookieNames.soundCookie);
        if (soundByCookie === undefined) {
            rp.settings.sound = false;
        } else {
            rp.settings.sound = (soundByCookie === "true");
            $("#sound").prop("checked", rp.settings.sound);
        }
        $('#sound').change(rp.updateSound);

        var autoByCookie = rp.getCookie(cookieNames.shouldAutoNextSlideCookie);
        if (autoByCookie === undefined) {
            rp.updateAutoNext();
        } else {
            rp.settings.shouldAutoNextSlide = (autoByCookie === "true");
            $("#autoNextSlide").prop("checked", rp.settings.shouldAutoNextSlide);
        }
        $('#autoNextSlide').change(rp.updateAutoNext);

        var updateTimeToNextSlide = function () {
            var val = $('#timeToNextSlide').val();
            rp.settings.timeToNextSlide = parseFloat(val) * 1000;
            rp.setCookie(cookieNames.timeToNextSlideCookie, val);
        };

        var timeByCookie = rp.getCookie(cookieNames.timeToNextSlideCookie);
        if (timeByCookie === undefined) {
            updateTimeToNextSlide();
        } else {
            rp.settings.timeToNextSlide = parseFloat(timeByCookie) * 1000;
            $('#timeToNextSlide').val(timeByCookie);
        }

        $('#fullScreenButton').click(rp.toggleFullScreen);

        $('#timeToNextSlide').keyup(rp.updateTimeToNextSlide);

        $('#prevButton').click(rp.prevSlide);
        $('#nextButton').click(function () { rp.nextSlide(); });
    };

    rp.addNumberButton = function (numberButton) {
        if (!numberButton || !numberButton.appendTo) {
            console.error('Invalid number button:', numberButton);
            return;
        }

        var navboxUls = $(".navbox ul");
        var thisNavboxUl = navboxUls[navboxUls.length - 1];

        // Check if we need to add a new row of buttons
        if (thisNavboxUl.children.length >= 10) {
            thisNavboxUl = $("<ul />").appendTo("#navboxContent");
        }

        numberButton.appendTo(thisNavboxUl);
    };

    rp.addImageSlide = function (item) {
        /*
        var pic = {
            "title": title,
            "url": url,
            "commentsLink": commentsLink,
            "over18": over18,
            "isVideo": video
        }
        */
        if(!item.data.is_gallery){
            var pic = embedit.redditItemToPic(item);
            if (!pic) {
                return;
            }
            for (i = 0; i < rp.photos.length; i += 1) {
                if (pic.url === rp.photos[i].url) {
                    return;
                }
            }
            rp.photos.push(pic);
            rp.session.foundOneImage = true;
            var i = rp.photos.length - 1;   
            var numberButton = $("<a />").html((i+1)-galleryOffset)
                .data("index", i)
                .attr("title", rp.photos[i].title)  
                .attr("id", "numberButton" + (i + 1))
            if (pic.over18) {
                numberButton.addClass("over18");
            }
            numberButton.click(function () {
                rp.showImage($(this));
            });
            numberButton.addClass("numberButton");
            rp.addNumberButton(numberButton);
        } else {
            const x = (rp.photos.length+1)-galleryOffset
            galleryOffset+=(item.data.gallery_data.items.length)-1
            $.each(item.data.gallery_data.items, function (j, image) {
                pic = {
                    "title": item.data.title,
                    "url": "https://i.redd.it/"+image.media_id+"."+(item.data.media_metadata[image.media_id].m).split('/')[1],
                    "data": item.data,
                    "commentsLink": item.data.url,
                    "over18": item.data.over_18,
                    "isVideo": item.data.is_video,
                    "subreddit": item.data.subreddit,
                    "galleryItem": j+1,
                    "galleryTotal": item.data.gallery_data.items.length,
                    "userLink": item.data.author,
                    "type": (item.data.media_metadata[image.media_id].m).split('/')[0]
                }; 
                for (i = 0; i < rp.photos.length; i += 1) {
                    if (pic.url === rp.photos[i].url) {
                        return; 
                    }
                }   
                rp.photos.push(pic);
                rp.session.foundOneImage = true;

                
            });
            var i = rp.photos.length - 1;
            var numberButton = $("<a />").html(x)
                .data("index", i-(rp.photos[i].galleryItem-1))
                .attr("title", rp.photos[i].title)
                .attr("id", "numberButton" + ((i + 1)-(rp.photos[i].galleryTotal-1)))
                .addClass("numberButton")
                .addClass("gallery");
            numberButton.append($("<a />").html("/"+rp.photos[i].galleryTotal).css({fontSize: 10}).addClass("galleryCount"))
            if (pic.over18) {
                numberButton.addClass("over18");
            }
            numberButton.click(function () {
                rp.showImage($(this))
            });
            rp.addNumberButton(numberButton);
        }

        // Do not preload all images, this is just not performant.
        // Especially in gif or high-res subreddits where each image can be 50 MB.
        // My high-end desktop browser was unresponsive at times.
        //preLoadImages(pic.url);

    };

    var arrow = {
        left: 37,
        up: 38,
        right: 39,
        down: 40
    };
    //var ONE_KEY = 49;
    //var NINE_KEY = 57;
    var SPACE = 32;
    var PAGEUP = 33;
    var PAGEDOWN = 34;
    //var ENTER = 13;
    var A_KEY = 65;
    var C_KEY = 67;
    var M_KEY = 77;
    var F_KEY = 70;
    var I_KEY = 73;
    var R_KEY = 82;
    var T_KEY = 84;
    var W_KEY = 87;
    var S_KEY = 83;
    var U_KEY = 85;
    var G_KEY = 71;


    // Register keyboard events on the whole document
    $(document).keyup(async function (e) {
        if (e.ctrlKey) {
            // ctrl key is pressed so we're most likely switching tabs or doing something
            // unrelated to redditp UI
            return;
        }

        //log(e.keyCode, e.which, e.charCode);

        // 37 - left
        // 38 - up
        // 39 - right
        // 40 - down
        // More info: http://stackoverflow.com/questions/302122/jquery-event-keypress-which-key-was-pressed
        // http://stackoverflow.com/questions/1402698/binding-arrow-keys-in-js-jquery
        var code = (e.keyCode ? e.keyCode : e.which);

        switch (code) {
            case C_KEY:
                $('#controlsDiv .collapser').click();
                break;
            case T_KEY:
                $('#titleDiv .collapser').click();
                break;
            case A_KEY:
                var $ans = $("#autoNextSlide");
                $ans.prop("checked", !$ans.is(':checked'));
                rp.updateAutoNext();
                break;
            case I_KEY:
                rp.open_in_background("#navboxLink");
                break;
            case U_KEY:
                rp.open_in_background("#navboxUser");
                break;
            case R_KEY:
                rp.open_in_background("#navboxCommentsLink");
                break;
            case F_KEY:
                rp.toggleFullScreen();
                break;
            case M_KEY:
                rp.toggleSound();
                break;
            case PAGEUP:
            case arrow.left:
            case arrow.up:
            case W_KEY:
                return rp.prevSlide(); 
            case PAGEDOWN:
            case arrow.right:
            case arrow.down:
            case SPACE:
            case S_KEY:
                return rp.nextSlide();
            case G_KEY:
                rp.skipGallery()
                break;
        }
    });


    //
    // Shows an image and plays the animation
    //
    rp.showImage = function (docElem) {
        // Retrieve the index we need to use
        var imageIndex = docElem.data("index");

        rp.saveHistory(imageIndex);
        rp.startAnimation(imageIndex);
    };

    rp.isLastImage = function (imageIndex) {
        if (rp.settings.nsfw) {
            return imageIndex === rp.photos.length - 1;
        } else {
            // look for remaining sfw images
            for (var i = imageIndex + 1; i < rp.photos.length; i++) {
                if (!rp.photos[i].over18) {
                    return false;
                }
            }
            return true;
        }
    };

    rp.preloadNextImage = function (imageIndex) {
        var next = rp.getNextSlideIndex(imageIndex);
        // Always clear cache - no need for memory bloat.
        // We only keep the next image preloaded.
        rp.cache = {};
        if (next < rp.photos.length)
            rp.cache[next] = rp.createDiv(next);
    };

    // History / back button stuff
    var lastSavedHistoryState = {
        index: -1,
        url: "",
    };
    var scheduledAnimation = null;

    rp.loadHistory = function (state) {
        //console.log("Loading history state " + event.state);

        var index;
        if (state == null || rp.photos[state.index] == null || rp.photos[state.index].url != state.url) {
            index = 0;
        } else {
            index = state.index;
            lastSavedHistoryState = state;
        }

        rp.startAnimation(index);
    };

    window.onpopstate = function (event) {
        // This is called when back/forward button is pressed and there is custom history states saved.
        rp.loadHistory(event.state);
    };

    rp.saveHistory = function (index) {
        if (window.history == null) {
            return; // History api is not supported, do nothing
        }

        var photo = rp.photos[index];
        if (index != lastSavedHistoryState.index && photo != null) {
            //console.log("Recorded history state " + index);
            lastSavedHistoryState = {
                index: index,
                url: photo.url,
            };
            history.pushState(lastSavedHistoryState, photo.title);
        }
    };

    rp.animationFinished = function () {
        if (scheduledAnimation != null) {
            var next = scheduledAnimation;
            scheduledAnimation = null;
            rp.startAnimation(next);
        }
    };

    rp.showDefault = function () {
        // What to show initially
        if (window.history != null) {
            rp.loadHistory(history.state);
        } else {
            rp.startAnimation(0);
        }
    };

    //
    // Starts the animation, based on the image index
    //
    // Variable to store if the animation is playing or not
    rp.startAnimation = async function (imageIndex) {
        rp.resetNextSlideTimer();

        if (rp.session.isAnimating) {
            // If animating, queue given image to be animated after this
            scheduledAnimation = imageIndex;
            return;
        }

        // If the same number has been chosen, or the index is outside the
        // rp.photos range, or we're already animating, do nothing
        if (rp.session.activeIndex === imageIndex || imageIndex > rp.photos.length - 1 || imageIndex < 0 || rp.session.isAnimating || rp.photos.length === 0) {
            return;
        }

        rp.session.isAnimating = true;
        await rp.animateNavigationBox(imageIndex);
        rp.slideBackgroundPhoto(imageIndex);
        rp.preloadNextImage(imageIndex);

        // Set the active index to the used image index
        rp.session.activeIndex = imageIndex;

        if (rp.isLastImage(rp.session.activeIndex) && rp.subredditUrl.indexOf('/imgur') !== 0) {
            rp.getRedditImages();
        }
    };

    rp.toggleNumberButton = async function (imageIndex,turnOn) {
        if (imageIndex<0){return}   
        var photo = rp.photos[imageIndex]
        if (!photo.galleryItem){
            var numberButton = $("#numberButton"+(imageIndex+1));
        } else {
            var numberButton = $("#numberButton"+((imageIndex+1)-(rp.photos[imageIndex].galleryItem-1))); 
        }
        if (turnOn) {
            numberButton.addClass('active');
        } else {
            numberButton.removeClass('active');
        }
    };

    //  
    // Animate the navigation box       
    //
    rp.animateNavigationBox = async function (imageIndex) {
        console.log(imageIndex)
        var photo = rp.photos[imageIndex];
        var subreddit = '/r/' + photo.subreddit;
        var user = '/u/' + photo.userLink + '/submitted';

        $('#navboxTitle').html(photo.title);
        $('#navboxSubreddit').attr('href', embedit.redditBaseUrl + subreddit).html(subreddit);
        $('#navboxLink').attr('href', photo.url).attr('title', photo.title);
        $('#navboxCommentsLink').attr('href', photo.commentsLink).attr('title', "Comments on reddit");
        $('#navboxUser').attr('href', window.location.origin + user).attr('user', "User on reddit");
        if (photo.galleryItem){
            $("#navboxGallery").text("Gallery: "+photo.galleryItem+"/"+photo.galleryTotal);
        } else {
            $("#navboxGallery").text("")
        }
        document.title = photo.title + " - " + subreddit + " - redditP";

        await rp.toggleNumberButton(rp.session.activeIndex, false);
        await rp.toggleNumberButton(imageIndex, true);
    };

    rp.playButton = $('<img id="playButton" src="/images/play.svg" />');
    rp.playButton.click(function () {
        if ($('video')[0]) {
            $('video')[0].play();
        } else {
            // serious bug, why did we show the play button but have no video there?
            rp.reportError('Play button pressed but no video there');
        }
        rp.playButton.hide();
    });
    $("#page").append(rp.playButton);
    rp.playButton.hide();

    rp.startPlayingVideo = function (vid_jq) {
        // Loop or auto next slide
        // TODO: make this update every time you check/uncheck auto-play
        if (rp.settings.shouldAutoNextSlide) {
            clearTimeout(rp.session.nextSlideTimeoutId);
            vid_jq.removeAttr('loop');
        }

        // sound cookie setting
        vid_jq[0].muted = !rp.settings.sound;

        // Disable subtitles by default
        var subTracks = vid_jq[0].textTracks || [];
        for (var i = 0; i < subTracks.length; i++) {
            subTracks[i].mode = 'hidden';
        }

        var onEndFunc = function (/*e*/) {
            if (rp.settings.shouldAutoNextSlide)
                rp.nextSlide();
        };
        vid_jq.one('ended', onEndFunc);
        // Tested on Firefox 43, gfycats that were preloaded do not autoplay when shown so
        // this is the workaround. We also prefer the play to start after the fadein finishes.
        var playPromise = vid_jq[0].play();
        if (playPromise && playPromise.catch) {
            // playPromise is `undefined` in firefox 46-48 it seems
            playPromise.catch(function (e) {
                // a trick to get around: DOMException: play() can only be initiated by a user gesture.
                // We show a play button that the user can press
                if (e.name === "NotAllowedError") {
                    //code: 0
                    //message: "play() can only be initiated by a user gesture."
                    //name: "NotAllowedError"
                    rp.playButton.show();
                    //setTimeout(function() {vid_jq[0].play();}, 100);
                } else {
                    // AbortError can happen I think with e.g. a 404, user clicking next before loading finishes,
                    // In that case, we don't want the play button to show. Here is a recorded example from 
                    // https://redditp.com/r/eyebleach/top?t=month
                    //code: 20,
                    //message: "The play() request was interrupted by a call to pause().",
                    //name: "AbortError",
                }
                console.log(e);
            });
        }
    };

    //
    // Slides the background photos
    //
    rp.slideBackgroundPhoto = function (imageIndex) {
        var divNode;
        if (rp.cache[imageIndex] === undefined) {
            divNode = rp.createDiv(imageIndex);
        } else {
            divNode = rp.cache[imageIndex];
        }

        divNode.prependTo(pictureSliderId);
        rp.fixRedditVideo(imageIndex);

        $(pictureSliderId + " div").fadeIn(rp.settings.animationSpeed);
        var oldDiv = $(pictureSliderId + " div:not(:first)");
        oldDiv.fadeOut(rp.settings.animationSpeed, function () {
            oldDiv.remove();
            rp.session.isAnimating = false;
            rp.animationFinished();

            var maybeVid = $('video');
            if (maybeVid.length > 0) {
                rp.startPlayingVideo(maybeVid);
            }
        });
    };

    rp.fixRedditVideo = function (imageIndex) {
        var photo = rp.photos[imageIndex];
        if (photo.url.indexOf("//v.redd.it/") < 0) {
            // only fix reddit videos
            return;
        }
        if (!photo.data.secure_media || !photo.data.secure_media.reddit_video) {
            console.log("Some new reddit videos seem to have a null secure_media. Hmmm.");
            return;
        }
        var url = photo.data.secure_media.reddit_video.dash_url;
        var player = dashjs.MediaPlayer().create();
        player.initialize(document.querySelector("video"), url, true);
    }

    rp.createDiv = function (imageIndex) {
        // Retrieve the accompanying photo based on the index
        var photo = rp.photos[imageIndex];
        //log("Creating div for " + imageIndex + " - " + photo.url);

        // Create a new div and apply the CSS
        var divNode = $("<div />");
        if (photo.type === embedit.imageTypes.image) {

            // TODO: REFACTOR BOTH IMAGES AND VIDEOS TO WORK WITH ONE FRAMEWORK - EMBEDIT

            // An actual image. Not a video/gif.
            // `preLoadImages` because making a div with a background css does not cause chrome
            // to preload it :/
            rp.preLoadImages(photo.url);
            var cssMap = Object();
            cssMap['display'] = "none";
            cssMap['background-image'] = "url(" + photo.url + ")";
            cssMap['background-repeat'] = "no-repeat";
            cssMap['background-size'] = "contain";
            cssMap['background-position'] = "center";

            divNode.css(cssMap).addClass("clouds");
        } else { //if(photo.type === imageTypes.gfycat || photo.type === imageTypes.gifv) {
            embedit.embed(photo.url, function (elem) {
                if (!elem) {
                    rp.reportError('Failed to handle url');
                    return divNode;
                }
                if (photo.url.indexOf("//v.redd.it/") >= 0) {
                    // Embedit is wrong here, ignore it.
                    // I'm ashamed of the spaghetti I'm in, but I'm also tired
                    // and want to go to sleep with this working.
                    // elem = document.createElement("video");
                    elem = $('<video autoplay playsinline loop controls="true" />');
                }
                divNode.append(elem);

                $(elem).attr({
                    playsinline: '',
                });
                if (photo.sound) {
                    // this case is for videos from v.redd.it domain only
                    // $("<audio loop autoplay " + (rp.settings.sound ? '' : 'muted') + "><source src='" + photo.sound + "' type='audio/aac'/></audio>").appendTo($(elem));
                    // console.log("we are here!", photo)
                    // console.log("we are here!", photo.data.secure_media.reddit_video.dash_url)

                    // var $audioTag = $("audio", elem).get(0);
                    // var $videoTag = $("video", divNode).get(0);

                    // // sync reddit audio and video tracks
                    // $audioTag.currentTime = $videoTag.currentTime;
                    // $videoTag.onplay = function () {
                    //     $audioTag.play();
                    // };
                    // $videoTag.onpause = function () {
                    //     $audioTag.pause();
                    // };
                    // $videoTag.onseeking = function () {
                    //     $audioTag.currentTime = $videoTag.currentTime;
                    // };
                }
                elem.width('100%').height('100%');
                // We start paused and play after the fade in.
                // This is to avoid cached or preloaded videos from playing.
                if (elem[0].pause) {
                    // Note this doesn't work on iframe embeds.
                    elem[0].pause();
                }
            });
        }// else {
        //    reportError('Unhandled image type');
        //}

        return divNode;
    };
    rp.skipGallery = async function () { 
        photo = rp.photos[rp.session.activeIndex];  
        if (!photo.data.is_gallery){
            return
        }
        var skipCount = (photo.galleryTotal - photo.galleryItem)+1
        rp.nextSlide(skipCount)
    };

    rp.verifyNsfwMakesSense = function () {
        // Cases when you forgot NSFW off but went to /r/nsfw
        // can cause strange bugs, let's help the user when over 80% of the
        // content is NSFW.
        var nsfwImages = 0;
        for (var i = 0; i < rp.photos.length; i++) {
            if (rp.photos[i].over18) {
                nsfwImages += 1;
            }
        }

        if (0.8 < nsfwImages * 1.0 / rp.photos.length) {
            rp.settings.nsfw = true;
            $("#nsfw").prop("checked", rp.settings.nsfw);
        }
    };

    rp.decodeUrl = function (url) {
        return decodeURIComponent(url.replace(/\+/g, " "));
    };
    rp.getRestOfUrl = function () {
        // Separate to before the question mark and after
        // Detect predefined reddit url paths. If you modify this be sure to fix
        // .htaccess
        // This is a good idea so we can give a quick 404 page when appropriate.

        var regexS = "(/(?:(?:r/)|(?:imgur/a/)|(?:u(?:ser)?/)|(?:domain/)|(?:search))[^&#?]*)[?]?(.*)";
        var regex = new RegExp(regexS);
        var results = regex.exec(window.location.href);
        //log(results);
        if (results === null) {
            return ["", ""];
        } else {
            return [results[1], rp.decodeUrl(results[2])];
        }
    };

    rp.failCleanup = function () {
        if (rp.photos.length > 0) {
            // already loaded images, don't ruin the existing experience
            return;
        }

        // remove "loading" title
        $('#navboxTitle').text('');

        // display alternate recommendations
        $('#recommend').css({ 'display': 'block' });
    };

    rp.parseQuery = function (queryString) {
        var query = {};
        var pairs = (queryString[0] === '?' ? queryString.substr(1) : queryString).split('&');
        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split('=');
            query[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1] || '');
        }
        return query;
    };

    rp.shuffle = function (arr) {
        var i, j, x;
        for (i = arr.length - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1));
            x = arr[i];
            arr[i] = arr[j];
            arr[j] = x;
        }
        return arr;
    };

    rp.isShuffleOn = function () {
        var query = rp.parseQuery(window.location.search);
        return !!query.shuffle;
    };

    rp.getRedditImages = async function () {
        if (rp.session.loadingNextImages) {
            return;
        }
        rp.session.loadingNextImages = true;

        // First load blocked users if we haven't already
        if (!rp.blockedUsers) {
            try {
                const response = await fetch(`${rp.apiBaseUrl}/api/blocked-users`);
                if (response.ok) {
                    const data = await response.json();
                    rp.blockedUsers = new Set(data.blockedUsers);
                    console.log('Loaded blocked users:', Array.from(rp.blockedUsers));
                }
            } catch (error) {
                console.error('Error loading blocked users:', error);
                rp.blockedUsers = new Set();
            }
        }

        // Construct Reddit API URL
        var jsonUrl = 'https://www.reddit.com' + rp.subredditUrl;
        if (jsonUrl.slice(-1) !== '/') {
            jsonUrl += '/';
        }
        jsonUrl += '.json?raw_json=1';
        if (rp.after) {
            jsonUrl += "&after=" + rp.after;
        }

        var failedAjax = function (data) {
            console.log("ajax failed", data);
            var message = "Failed to load images. Please check your internet connection and try again.";
            var isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
            if (isFirefox) {
                message = "Failed to load images. Try disabling tracking protection in Firefox.";
            }
            rp.reportError(message);
            rp.failCleanup();
        };

        var handleData = function (response) {
            try {
                if (!response || !response.data || !response.data.children) {
                    rp.reportError("Invalid data received from Reddit");
                    return;
                }

                var children = response.data.children;
                var after = response.data.after;

                if (children.length === 0) {
                    rp.reportError("No images found in this subreddit");
                    return;
                }

                if (rp.isShuffleOn()) {
                    rp.shuffle(children);
                }

                // Filter out posts from blocked users before processing
                children = children.filter(item => {
                    if (!item || !item.data) return false;
                    const username = item.data.author;
                    return !rp.blockedUsers.has(username);
                });

                console.log(`Processing ${children.length} non-blocked posts`);
                
                $.each(children, function (i, item) {
                    if (!item || !item.data) {
                        console.error('Invalid data item:', item);
                        return;
                    }
                    rp.addImageSlide(item);
                });

                rp.verifyNsfwMakesSense();

                if (!rp.session.foundOneImage) {
                    rp.reportError("No displayable images found in that url");
                }

                // show the first image
                if (rp.session.activeIndex === -1) {
                    rp.showDefault();
                }

                if (after) {
                    rp.after = after;
                } else {
                    // Show the user we're starting from the top
                    var numberButton = $("<span />").addClass("numberButton").text("-");
                    rp.addNumberButton(numberButton);
                }
                rp.session.loadingNextImages = false;
            } catch (error) {
                console.error('Error processing Reddit data:', error);
                rp.reportError("Error processing Reddit data");
            }
        };

        $.ajax({
            url: jsonUrl,
            dataType: 'jsonp',
            jsonp: 'jsonp',
            success: handleData,
            error: failedAjax,
            crossDomain: true,
            timeout: 10000
        });
    };

    rp.getImgurAlbum = function (url) {
        var albumID = url.match(/.*\/(.+?$)/)[1];
        var jsonUrl = 'https://api.imgur.com/3/album/' + albumID;
        //log(jsonUrl);
        var failedAjax = function (/*data*/) {
            rp.reportError("Failed ajax, maybe a bad url? Sorry about that :(");
            rp.failCleanup();
        };
        var handleData = function (data) {

            //log(data);

            var children = data.data.images;

            if (children.length === 0) {
                rp.reportError("No data from this url :(");
                return;
            }

            if (rp.isShuffleOn()) {
                rp.shuffle(children);
            }
            $.each(children, function (i, item) {
                rp.addImageSlide({
                    url: item.link,
                    title: item.title,
                    over18: item.nsfw,
                    commentsLink: ""
                });
            });

            rp.verifyNsfwMakesSense();

            if (!rp.session.foundOneImage) {
                console.log(jsonUrl);
                rp.reportError("Sorry, no displayable images found in that url :(");
            }

            // show the first image
            if (rp.session.activeIndex === -1) {
                // was startShow();
                rp.showDefault();
            }

            //log("No more pages to load from this subreddit, reloading the start");

            // Show the user we're starting from the top
            //var numberButton = $("<span />").addClass("numberButton").text("-");
            //rp.addNumberButton(numberButton);

            rp.session.loadingNextImages = false;
        };

        $.ajax({
            url: jsonUrl,
            dataType: 'json',
            success: handleData,
            error: failedAjax,
            404: failedAjax,
            timeout: 5000,
            beforeSend: function (xhr) {
                xhr.setRequestHeader('Authorization',
                    'Client-ID ' + 'f2edd1ef8e66eaf');
            }
        });
    };

    rp.setupUrls = function () {
        rp.urlData = rp.getRestOfUrl();
        //log(rp.urlData)
        rp.subredditUrl = rp.urlData[0];
        getVars = rp.urlData[1];

        if (getVars.length > 0) {
            getVarsQuestionMark = "?" + getVars;
        } else {
            getVarsQuestionMark = "";
        }

        // Remove .compact as it interferes with .json (we got "/r/all/.compact.json" which doesn't work).
        rp.subredditUrl = rp.subredditUrl.replace(/.compact/, "");
        // Consolidate double slashes to avoid r/all/.compact/ -> r/all//
        rp.subredditUrl = rp.subredditUrl.replace(/\/{2,}/, "/");

        var subredditName;
        if (rp.subredditUrl === "") {
            rp.subredditUrl = "/";
            subredditName = "reddit.com" + getVarsQuestionMark;
            //var options = ["/r/aww/", "/r/earthporn/", "/r/foodporn", "/r/pics"];
            //rp.subredditUrl = options[Math.floor(Math.random() * options.length)];
        } else {
            subredditName = rp.subredditUrl + getVarsQuestionMark;
        }


        var visitSubredditUrl = embedit.redditBaseUrl + rp.subredditUrl + getVarsQuestionMark;

        // truncate and display subreddit name in the control box
        var displayedSubredditName = subredditName;
        // empirically tested capsize, TODO: make css rules to verify this is enough.
        // it would make the "nsfw" checkbox be on its own line :(
        var capsize = 50;
        if (displayedSubredditName.length > capsize) {
            displayedSubredditName = displayedSubredditName.substr(0, capsize) + "&hellip;";
        }
        $('#subredditUrl').html("<a href='" + visitSubredditUrl + "'>sub</a>");

        // This `document.title` happens on page load and will later be overwritten
        // by every slide that loads.
        document.title = "redditP - " + displayedSubredditName;
    };

    var getVars;
    var getVarsQuestionMark;

    rp.initState();
    rp.loadBlockedUsers();
    rp.setupUrls();

    // if ever found even 1 image, don't show the error
    rp.session.foundOneImage = false;

    if (rp.subredditUrl.indexOf('/imgur') === 0) {
        rp.getImgurAlbum(rp.subredditUrl);
    } else {
        rp.getRedditImages();
    }
});

/*rp.flattenRedditData = function(data) {
    // Parse comments, get all links
    // https://www.reddit.com/r/photoshopbattles/comments/7i5ipw/psbattle_this_hyped_up_mannequin/.json?jsonp=?&

    var queue = [];
    var urls = [];
    if (data && data.data && data.data.children) {
        children = data.data.children;
    } else {
        // comments of e.g. a photoshopbattles post
        if (data.length > 0) {
            for (var i = 0; i < data.length; i++) {
                children = rp.flattenRedditData(data[i]);
                Array.prototype.push.apply(children, newChildren);
            }
        }
    }

    var urlChildren = [];
    for (var i = 0; i < children.length; i++) {
        var item = children[i];
        if (item.data && (item.data.url || item.data.link_url)) {
            // great
            urlChildren.push(item);
            continue;
        }

        // keep digging for more urls, remove this one
        if (item.data) {
            var newChildren = rp.flattenRedditData(item.data.replies);
            Array.prototype.push.apply(urlChildren, newChildren);
            var newChildren = flattenRedditData(item.data.children);
            Array.prototype.push.apply(urlChildren, newChildren);
            if (item.data.body) {
                // this is a comment
                console.log('body', item.body);
            }
            continue;
        }
    }

    return urls;
}*/

function browserNodeExport(exported, name) {
    // based off of http://www.matteoagosti.com/blog/2013/02/24/writing-javascript-modules-for-both-browser-and-node/
    if (typeof module !== 'undefined' && typeof module.exports !== 'undefined') {
        /* global module */
        module.exports = exported;
    } else {
        if (typeof define === 'function' && define.amd) {
            /* global define */
            define([], function () {
                return exported;
            });
        } else {
            window[name] = exported;
        }
    }
}

browserNodeExport(rp, 'rp');
