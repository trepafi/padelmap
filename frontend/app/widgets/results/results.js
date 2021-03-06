(function () {
    'use strict';

    var module = angular.module('olaf.widgets.results', ['ui.bootstrap', 'uiGmapgoogle-maps']);
    module.directive('olafResults', OlafResultsDirective);
    module.factory('olafLocation', locationFactory);

    OlafResultsDirective.$inject = [
        '$location', '$q', '$timeout', 'events', 'config', 'olafLocation',
        'localRepo', 'centersSvc', 'Location', 'Map', 'Results'];

    function OlafResultsDirective (
            $location, $q, $timeout, events, config, olafLocation,
            localRepo, centersSvc, Location, Map, Results) {
        return {
            restrict: 'E',
            templateUrl: '/widgets/results/results.html',
            link: olafResultsLink,
            controller: olafResultsCtrl
        };

        function olafResultsLink (scope, elem, attrs) {
            // console.log('-->', attrs.type);
            scope.changeView(attrs.type || 'list');
        }

        olafResultsCtrl.$inject = ['$scope'];
        function olafResultsCtrl($scope) {
            $scope.searcherType = "R";

            /* Main data */
            $scope.centers = [];    // Since filters are complex I need a filtered centers list
            $scope.center = {};     // Current center in details view
            $scope.previousList = false;
            $scope.showSidePanel = true;

            $scope.map = new Map();

            $scope.changeView = changeView;
            $scope.toggleCentersList = toggleCentersList;
            $scope.userLocation = null;
            $scope.mobileListView = false;

            // ===== Events ===== //
            $scope.$watch('resultType', function(value) {
                $scope.isList = (value === 'list' || value == 'nearby');
                // console.log('isList:', $scope.isList);
            });




            // ===== Events ===== //
            var deregisters = [];
            $scope.$on('$destroy', _.executor(deregisters));

            deregisters.push(
                events.$on(events.sr.FILTER_APPLIED, function(event, filters) {
                    $scope.centers = centersSvc.applyFilters(filters)
                    $scope.map.markers = getMarkers();
                }),

                events.$on(events.sr.CENTER_SELECTED, function(event, center) {
                    centerSelected(center);
                }),

                events.$on(events.sr.GO_BACK_TO_LIST, function(event) {
                    goBackToList();
                }),

                events.$on(events.footer.LIST_VIEW, function(event) {
                    $scope.mobileListView = true;
                    // console.log('LIST_VIEW', $scope.mobileListView);
                }),

                events.$on(events.footer.MAP_VIEW, function(event) {
                    $scope.mobileListView = false;
                    // console.log('MAP_VIEW', $scope.mobileListView);
                })
            );


            // ==== Functions ==== //

            // Markers functions
            function getMarkers() {
                var result = []
                // console.log('Centers:', $scope.centers);

                _.forEach($scope.centers, function(item) {
                    // console.log(item);
                    result.push(_.extend(item, {
                        // 'id': item.friendly,
                        'icon': '/img/player.png',
                        'showWindow': false,
                        'onClick': onClickMarker
                    }));
                });

                if(result.length) {
                    $scope.map.setCenter(result[0].coordinates);
                }

                return result;
            }

            function onClickMarker(result) {
                // console.log(result.model);
                // events.$emit(events.sr.CENTER_SELECTED, result.model);
            }

            function changeView(value) {
                $scope.resultType = value;
                //console.log('Changing view.', value, $scope.previousList);

                switch(value) {
                    case 'nearby':
                    case 'list':
                        $scope.map.zoom = config.maps.zoom.big;
                        if(!$scope.previousList) {
                            localRepo.set(config.localRepo.srPath, $location.path());
                            getCentersInfo(value);
                        }
                    break;

                    case 'details':
                        getDetailedCenterInfo();
                    break;
                }
            }

            function getCentersInfo(value) {
                function afterData(response) {
                    // console.log(response);
                    var defer = $q.defer();
                    $scope.location.setName(response.location);
                    $scope.centers = response.items;
                    $scope.map.markers = getMarkers();
                    events.$emit(events.sr.DATA_LOADED);
                    $timeout(defer.resolve, 10);
                    return defer.promise;
                }

                switch(value) {
                    case 'list':
                        $scope.location = Location.convertPathToLocation($location.path());
                        centersSvc.getDataByLocation($scope.location).then(afterData);

                        var dataSite = {
                            title: $scope.location.getName(),
                            description: config.texts.description.replace(/%s/g, $scope.location.getName()),
                            keywords: config.texts.keywords.replace(/%s/g, $scope.location.getName())
                        };

                        events.$emit(events.metatags.UPDATE, dataSite);
                    break;

                    case 'nearby':
                        var search = $location.search(),
                            geoLocation = {
                                latitude: search.lat,
                                longitude: search.long
                            };

                        events.$emit(events.metatags.UPDATE, {
                            title: config.texts.nearby,
                            description: config.texts.nearby,
                            keywords: config.texts.nearby
                        });

                        $scope.userLocation = [
                            {
                                id: 'home',
                                coordinates: geoLocation,
                                icon: '/img/home.png',
                                options: {
                                    // draggable: true,
                                    animation: google.maps.Animation.BOUNCE
                                }
                            }
                        ];

                        $scope.location = new Location();
                        centersSvc.getDataNearby(geoLocation).then(afterData).then(function() {
                            $scope.map.center = geoLocation;
                        });
                    break;
                }
            }

            function getDetailedCenterInfo() {
                var id = $scope.center.id ? $scope.center.id : _.last(_.compact($location.path().split('/')));
                centersSvc.getCenterById(id).then(function(response) {
                    $scope.center = response;

                    events.$emit(events.metatags.UPDATE, {
                        title: response.name,
                        description: response.name,
                        keywords: response.name
                    });

                    if(!$scope.previousList) {
                        $scope.centers = [ response ];
                        $scope.map.markers = getMarkers();
                    }

                    _.extend($scope.map, {
                        center: response.coordinates,
                        zoom: config.maps.zoom.small
                    });

                    // Looking for booking url
                    _.each(response.services, function(item) {
                        if(item.abrev === 'booking') {
                            $scope.center.booking = item.value;
                        }
                    });

                });
            }

            function centerSelected(center) {
                var path = '/' + config.paths.details + '/' + center.friendly + '/' + center.id;
                olafLocation.skipReload().path(path);
                $scope.previousList = true;
                $scope.center = center;
                changeView('details');
            }

            function goBackToList() {
                olafLocation.skipReload().path(localRepo.get(config.localRepo.srPath));
                changeView('list');
            };

            function toggleCentersList() {
                $scope.showSidePanel = !$scope.showSidePanel;
                $scope.tooltipClose = ($scope.showSidePanel ? "Ocultar" : "Mostrar");
            }

        }
    }

    /**
     *  Hack to avoid reload the page after setting the $location.path
     *  From: https://github.com/angular/angular.js/issues/1699
     *
     *  TODO: Move to some sort of “Angular extension” file
     */
    locationFactory.$inject = ['$location', '$route', '$rootScope', '$timeout'];
    function locationFactory($location, $route, $rootScope, $timeout) {
        $location.skipReload = function () {
            var lastRoute = $route.current,
                deregister = $rootScope.$on('$locationChangeSuccess', function () {
                    $route.current = lastRoute;
                });
            $timeout(function () {
                deregister();
            }, 1000);
            return $location;
        };
        return $location;
    }
}());
