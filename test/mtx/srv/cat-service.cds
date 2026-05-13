using {sap.capire.bookshop as my} from '../db/schema';

@requires: 'authenticated-user'
service CatalogService {

  entity Books as projection on my.Books;
}
