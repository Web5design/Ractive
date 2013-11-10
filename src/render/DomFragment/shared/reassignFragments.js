define([
	'config/types',
	'shared/unregisterDependant',
	'shared/processDeferredUpdates',
	'render/shared/ExpressionResolver'
], function (
	types,
	unregisterDependant,
	processDeferredUpdates,
	ExpressionResolver
) {

	'use strict';

	return function ( root, section, start, end, by ) {
		var i, fragment, indexRef, oldIndex, newIndex, oldKeypath, newKeypath;

		indexRef = section.descriptor.i;

		for ( i=start; i<end; i+=1 ) {
			fragment = section.fragments[i];

			// If this fragment was rendered with innerHTML, we have nothing to do
			// TODO a less hacky way of determining this
			if ( fragment.html ) {
				continue;
			}

			oldIndex = i - by;
			newIndex = i;

			oldKeypath = section.keypath + '.' + ( i - by );
			newKeypath = section.keypath + '.' + i;

			// change the fragment index
			fragment.index += by;

			reassignFragment( fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
		}

		processDeferredUpdates( root );
	};


	// Helpers
	function reassignFragment ( fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i, item, context;

		if ( fragment.indexRefs && fragment.indexRefs[ indexRef ] !== undefined ) {
			fragment.indexRefs[ indexRef ] = newIndex;
		}

		// fix context stack
		i = fragment.contextStack.length;
		while ( i-- ) {
			context = fragment.contextStack[i];
			if ( context.substr( 0, oldKeypath.length ) === oldKeypath ) {
				fragment.contextStack[i] = context.replace( oldKeypath, newKeypath );
			}
		}

		i = fragment.items.length;
		while ( i-- ) {
			item = fragment.items[i];

			switch ( item.type ) {
				case types.ELEMENT:
				reassignElement( item, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;

				case types.PARTIAL:
				reassignFragment( item.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;

				case types.SECTION:
				case types.INTERPOLATOR:
				case types.TRIPLE:
				reassignMustache( item, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
				break;
			}
		}
	}

	function reassignElement ( element, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i, attribute, storage, masterEventName, proxies, proxy, binding, bindings;

		i = element.attributes.length;
		while ( i-- ) {
			attribute = element.attributes[i];

			if ( attribute.fragment ) {
				reassignFragment( attribute.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );

				if ( attribute.twoway ) {
					attribute.updateBindings();
				}
			}
		}

		if ( storage = element.node._ractive ) {
			if ( storage.keypath.substr( 0, oldKeypath.length ) === oldKeypath ) {
				storage.keypath = storage.keypath.replace( oldKeypath, newKeypath );
			}

			if ( indexRef !== undefined ) {
				storage.index[ indexRef ] = newIndex;
			}

			for ( masterEventName in storage.events ) {
				proxies = storage.events[ masterEventName ].proxies;
				i = proxies.length;

				while ( i-- ) {
					proxy = proxies[i];

					if ( typeof proxy.n === 'object' ) {
						reassignFragment( proxy.a, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
					}

					if ( proxy.d ) {
						reassignFragment( proxy.d, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
					}
				}
			}

			if ( binding = storage.binding ) {
				if ( binding.keypath.substr( 0, oldKeypath.length ) === oldKeypath ) {
					bindings = storage.root._twowayBindings[ binding.keypath ];
					
					// remove binding reference for old keypath
					bindings.splice( bindings.indexOf( binding ), 1 );

					// update keypath
					binding.keypath = binding.keypath.replace( oldKeypath, newKeypath );

					// add binding reference for new keypath
					bindings = storage.root._twowayBindings[ binding.keypath ] || ( storage.root._twowayBindings[ binding.keypath ] = [] );
					bindings.push( binding );
				}
			}
		}

		// reassign children
		if ( element.fragment ) {
			reassignFragment( element.fragment, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
		}
	}

	function reassignMustache ( mustache, indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath ) {
		var i;

		// expression mustache?
		if ( mustache.descriptor.x ) {
			if ( mustache.keypath ) {
				unregisterDependant( mustache );
			}
			
			if ( mustache.expressionResolver ) {
				mustache.expressionResolver.teardown();
			}

			mustache.expressionResolver = new ExpressionResolver( mustache );
		}

		// normal keypath mustache?
		if ( mustache.keypath ) {
			if ( mustache.keypath.substr( 0, oldKeypath.length ) === oldKeypath ) {
				mustache.resolve( mustache.keypath.replace( oldKeypath, newKeypath ) );
			}
		}

		// index ref mustache?
		else if ( mustache.indexRef === indexRef ) {
			mustache.value = newIndex;
			mustache.render( newIndex );
		}

		// otherwise, it's an unresolved reference. the context stack has been updated
		// so it will take care of itself

		// if it's a section mustache, we need to go through any children
		if ( mustache.fragments ) {
			i = mustache.fragments.length;
			while ( i-- ) {
				reassignFragment( mustache.fragments[i], indexRef, oldIndex, newIndex, by, oldKeypath, newKeypath );
			}
		}
	}

});